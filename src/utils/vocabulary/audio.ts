import { Mp3Encoder } from "@breezystack/lamejs"
import JSZip from "jszip"
import { isWav, sha256, MAX_AUDIO_BYTES, type AudioAsset, type VocabularyBundle } from "./schema"

// Portable MPEG Layer III frames, no ID3, executable metadata or browser encoder.
// Keep this decoder-independent contract available in file:// and HTTP HTML.
export function isMp3(bytes: Uint8Array): boolean {
  let offset = 0,
    frames = 0
  while (offset + 4 <= bytes.length) {
    const a = bytes[offset]!,
      b = bytes[offset + 1]!,
      c = bytes[offset + 2]!
    const version = (b >> 3) & 3,
      rateIndex = (c >> 2) & 3,
      bitrateIndex = c >> 4
    if (
      a !== 255 ||
      (b & 224) !== 224 ||
      version === 1 ||
      ((b >> 1) & 3) !== 1 ||
      rateIndex === 3 ||
      bitrateIndex === 0 ||
      bitrateIndex === 15
    )
      return false
    const rate = [44100, 48000, 32000][rateIndex]! / (version === 3 ? 1 : version === 2 ? 2 : 4)
    const bitrate =
      (version === 3
        ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
        : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
      )[bitrateIndex]! * 1000
    offset += Math.floor(((version === 3 ? 144 : 72) * bitrate) / rate) + ((c >> 1) & 1)
    if (offset > bytes.length) return false
    frames++
  }
  return offset === bytes.length && frames >= 2
}

function pcm16(bytes: Uint8Array, maxBytes = MAX_AUDIO_BYTES) {
  if (!isWav(bytes) || bytes.length > maxBytes) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(4, true) + 8 !== bytes.length) return null
  let format: { channels: number; rate: number } | undefined, data: Uint8Array | undefined
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const tag = new TextDecoder().decode(bytes.subarray(offset, offset + 4)),
      size = view.getUint32(offset + 4, true),
      start = offset + 8
    if (start + size > bytes.length) return null
    if (tag === "fmt ") {
      if (size < 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 14, true) !== 16)
        return null
      const channels = view.getUint16(start + 2, true),
        rate = view.getUint32(start + 4, true)
      if (
        ![1, 2].includes(channels) ||
        ![8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000].includes(rate) ||
        view.getUint16(start + 12, true) !== channels * 2 ||
        view.getUint32(start + 8, true) !== rate * channels * 2
      )
        return null
      format = { channels, rate }
    } else if (tag === "data") data = bytes.subarray(start, start + size)
    offset = start + size + (size & 1)
  }
  if (!format || !data?.length || data.length % (format.channels * 2)) return null
  const samples = new Int16Array(data.length / (format.channels * 2)),
    source = new DataView(data.buffer, data.byteOffset, data.byteLength)
  for (let i = 0; i < samples.length; i++)
    samples[i] =
      format.channels === 1
        ? source.getInt16(i * 2, true)
        : Math.round((source.getInt16(i * 4, true) + source.getInt16(i * 4 + 2, true)) / 2)
  return { samples, rate: format.rate }
}

// Same parser, with an explicit size budget for standalone speech downloads.
// Vocabulary keeps its published default budget and encoding path unchanged.
export { pcm16 as parseWavPcm16 }

async function zipSize(bytes: Uint8Array) {
  // Compare actual DEFLATE sizes: silence or a tiny WAV may beat lossy MP3.
  return (
    await new JSZip().file("a", bytes).generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    })
  ).length
}

export async function compressVocabularyAudio(
  asset: AudioAsset,
  signal?: AbortSignal,
): Promise<AudioAsset> {
  signal?.throwIfAborted()
  if (asset.contentType === "audio/mpeg") {
    if (!isMp3(asset.bytes)) throw new Error("Invalid vocabulary MP3")
    return asset // Never encode already-lossy audio a second time.
  }
  const source = pcm16(asset.bytes)
  if (!source) return asset // Preserve legacy WAV encodings we cannot safely convert.
  const encoder = new Mp3Encoder(1, source.rate, 64),
    chunks: Uint8Array[] = []
  for (let offset = 0; offset < source.samples.length; offset += 1152) {
    signal?.throwIfAborted()
    const chunk = encoder.encodeBuffer(source.samples.subarray(offset, offset + 1152))
    if (chunk.length) chunks.push(new Uint8Array(chunk))
    if (offset % (1152 * 24) === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  chunks.push(new Uint8Array(encoder.flush()))
  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  signal?.throwIfAborted()
  if (!isMp3(bytes)) throw new Error("MP3 encoder produced invalid audio")
  if (bytes.length >= asset.bytes.length || (await zipSize(bytes)) >= (await zipSize(asset.bytes)))
    return asset
  signal?.throwIfAborted()
  return { id: await sha256(bytes), bytes, contentType: "audio/mpeg" }
}

export async function compressVocabularyBundle(
  bundle: VocabularyBundle,
): Promise<VocabularyBundle> {
  const used = new Set(bundle.cards.flatMap((card) => [card.audio.word, card.audio.example])),
    aliases = new Map<string, string>(),
    assets = new Map<string, AudioAsset>()
  for (const asset of bundle.audio) {
    if (!used.has(asset.id) || aliases.has(asset.id)) continue
    const result = await compressVocabularyAudio(asset)
    aliases.set(asset.id, result.id)
    assets.set(result.id, result)
  }
  if ([...used].some((id) => !aliases.has(id))) throw new Error("Sổ thiếu audio.")
  return {
    ...bundle,
    cards: bundle.cards.map((card) => ({
      ...card,
      audio: { word: aliases.get(card.audio.word)!, example: aliases.get(card.audio.example)! },
    })),
    audio: [...assets.values()],
  }
}
