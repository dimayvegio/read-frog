import { Mp3Encoder } from "@breezystack/lamejs"
import { isMp3, parseWavPcm16 } from "@/utils/vocabulary/audio"

export const MAX_TTS_EXPORT_AUDIO_BYTES = 128 * 1024 * 1024
export const MAX_TTS_MP3_BYTES = 32 * 1024 * 1024
/** One continuous MP3 encoder for all chunks; WAV headers are never concatenated into audio. */
export async function encodeSpeechMp3(
  chunks: Uint8Array[],
  signal: AbortSignal,
): Promise<Uint8Array> {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0)
  if (!size || size > MAX_TTS_EXPORT_AUDIO_BYTES)
    throw new Error("Speech audio is too large to export")
  const sources = chunks.map((chunk) => parseWavPcm16(chunk, MAX_TTS_EXPORT_AUDIO_BYTES))
  const rate = sources[0]?.rate
  if (!rate || sources.some((source) => !source || source.rate !== rate))
    throw new Error("Speech WAV formats do not match")
  const encoder = new Mp3Encoder(1, rate, 64),
    encoded: Uint8Array[] = []
  let bytes = 0,
    frames = 0
  const append = (part: Uint8Array) => {
    if (!part.length) return
    bytes += part.length
    if (bytes > MAX_TTS_MP3_BYTES) throw new Error("MP3 file is too large")
    encoded.push(new Uint8Array(part))
  }
  for (const source of sources) {
    for (let offset = 0; offset < source!.samples.length; offset += 1152) {
      signal.throwIfAborted()
      append(encoder.encodeBuffer(source!.samples.subarray(offset, offset + 1152)))
      if (++frames % 24 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }
  append(encoder.flush())
  signal.throwIfAborted()
  const result = new Uint8Array(bytes)
  let offset = 0
  for (const part of encoded) {
    result.set(part, offset)
    offset += part.length
  }
  if (!isMp3(result)) throw new Error("Invalid MP3 output")
  return result
}
