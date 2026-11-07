import type { QueryClient } from "@tanstack/react-query"
import type { OpenAITTSConfig, TTSAudioChunk } from "@/types/openai-tts"
import { OPENAI_TTS_FILE_PORT } from "@/types/openai-tts"
import { createPortStreamPromise } from "@/utils/content-script/port-streaming"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { sendMessage } from "@/utils/message"
import { splitTextByUtf8Bytes } from "@/utils/server/edge-tts/chunk"
import { getOpenAIAudio } from "@/utils/tts-playback/openai-audio-cache"
import { readingAssetId, validateReadingAsset } from "./db"
import {
  MAX_READING_ARCHIVE,
  referencedReadingAssets,
  readingOptionsSchema,
  type ReadingAsset,
  type ReadingPassage,
  type ReadingOptions,
} from "./schema"

export interface ReadingStep {
  pair: number
  side: "original" | "translation" | "recording" | "gap"
  asset?: ReadingAsset
  seconds?: number
}
// Frame duration is checked before decoding imported audio, including low-bitrate files.
function mp3Seconds(asset: ReadingAsset) {
  validateReadingAsset(asset)
  if (asset.type !== "audio/mpeg") throw new Error("Audio mẫu phải là MP3.")
  let offset = 0,
    seconds = 0
  const bytes = asset.bytes
  while (offset + 4 <= bytes.length) {
    const b = bytes[offset + 1]!,
      c = bytes[offset + 2]!,
      version = (b >> 3) & 3
    const rate = [44100, 48000, 32000][(c >> 2) & 3]! / (version === 3 ? 1 : version === 2 ? 2 : 4)
    const bitrate =
      (version === 3
        ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
        : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
      )[(c >> 4) & 15]! * 1000
    seconds += (version === 3 ? 1152 : 576) / rate
    offset += Math.floor(((version === 3 ? 144 : 72) * bitrate) / rate) + ((c >> 1) & 1)
  }
  return seconds
}
export function readingSequence(
  passage: ReadingPassage,
  assets: ReadingAsset[],
  input: ReadingOptions,
): ReadingStep[] {
  const options = readingOptionsSchema.parse(input),
    map = new Map(assets.map((asset) => [asset.id, asset])),
    steps: ReadingStep[] = []
  const add = (pair: number, side: "original" | "translation", id: string | null) => {
    const asset = id ? map.get(id) : null
    if (!asset) throw new Error("Chưa có đủ audio. Bấm Tạo audio trước.")
    steps.push({ pair, side, asset })
  }
  const gap = (pair: number) => {
    if (options.gap) steps.push({ pair, side: "gap", seconds: options.gap })
  }
  passage.pairs.forEach((pair, index) => {
    for (let repeat = 0; repeat < options.repeats; repeat++) {
      add(index, "original", pair.originalAudio)
      if (repeat < options.repeats - 1) gap(index)
    }
    if (options.translation) {
      gap(index)
      add(index, "translation", pair.translationAudio)
    }
    if (index < passage.pairs.length - 1) gap(index)
  })
  return steps
}
export async function generateReadingAudio(
  passage: ReadingPassage,
  assets: ReadingAsset[],
  config: OpenAITTSConfig,
  client: QueryClient,
  signal: AbortSignal,
  includeTranslation: boolean,
  progress: (done: number, total: number) => void,
  force = false,
) {
  const { encodeSpeechMp3 } = await import("@/utils/tts-playback/mp3-download")
  const next = structuredClone(passage),
    map = new Map(assets.map((asset) => [asset.id, asset]))
  if (force || JSON.stringify(next.speech) !== JSON.stringify(config))
    for (const pair of next.pairs) {
      pair.originalAudio = null
      pair.translationAudio = null
    }
  const status = await sendMessage("getOpenAIKeyStatus")
  signal.throwIfAborted()
  if (!status.configured) throw new Error("Hãy lưu API key OpenAI trong cài đặt.")
  const jobs = next.pairs.flatMap((pair) =>
    (["original", ...(includeTranslation ? ["translation"] : [])] as ("original" | "translation")[])
      .filter((side) => !pair[side === "original" ? "originalAudio" : "translationAudio"])
      .map((side) => ({ pair, side })),
  )
  for (const [index, { pair, side }] of jobs.entries()) {
    progress(index, jobs.length)
    const wav: Uint8Array[] = []
    let size = 0
    for (const chunk of splitTextByUtf8Bytes(pair[side], 1800)) {
      signal.throwIfAborted()
      const audio = await getOpenAIAudio(client, chunk, config, status.revision, signal, () =>
        createPortStreamPromise<TTSAudioChunk>(
          OPENAI_TTS_FILE_PORT,
          { requestId: getRandomUUID(), text: chunk, config },
          { signal },
        ),
      )
      signal.throwIfAborted()
      if (audio.contentType !== "audio/wav" || audio.audioBase64.length > 12 * 1024 * 1024)
        throw new Error("Audio OpenAI không hợp lệ.")
      const bytes = Uint8Array.from(atob(audio.audioBase64), (char) => char.charCodeAt(0))
      size += bytes.length
      if (size > MAX_READING_ARCHIVE) throw new Error("Audio câu quá dài; hãy chia nhỏ bài.")
      wav.push(bytes)
    }
    const bytes = await encodeSpeechMp3(wav, signal),
      asset = validateReadingAsset({ id: readingAssetId(bytes), type: "audio/mpeg", bytes })
    map.set(asset.id, asset)
    pair[side === "original" ? "originalAudio" : "translationAudio"] = asset.id
    const used = new Set(referencedReadingAssets(next))
    if (
      [...map.values()]
        .filter((item) => used.has(item.id))
        .reduce((sum, item) => sum + item.bytes.length, 0) > MAX_READING_ARCHIVE
    )
      throw new Error("Bài vượt 64 MiB audio; hãy chia nhỏ bài.")
    progress(index + 1, jobs.length)
  }
  const current = await sendMessage("getOpenAIKeyStatus")
  signal.throwIfAborted()
  if (!current.configured || current.revision !== status.revision)
    throw new Error("API key đã đổi; hãy tạo audio lại.")
  next.speech = config
  const used = new Set(referencedReadingAssets(next))
  return { passage: next, assets: [...map.values()].filter((asset) => used.has(asset.id)) }
}
export function pcmReadingWav(samples: Int16Array, rate: number) {
  const bytes = new Uint8Array(44 + samples.length * 2),
    view = new DataView(bytes.buffer)
  for (const [offset, text] of [
    [0, "RIFF"],
    [8, "WAVE"],
    [12, "fmt "],
    [36, "data"],
  ] as const)
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i)
  view.setUint32(4, bytes.length - 8, true)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i]!, true)
  return bytes
}
/** Export follows the same repeat/gap/translation sequence as playback. No API calls. */
export async function encodeReadingSequence(steps: ReadingStep[], signal: AbortSignal) {
  const { encodeSpeechMp3, MAX_TTS_EXPORT_AUDIO_BYTES } =
    await import("@/utils/tts-playback/mp3-download")
  const context = new AudioContext({ sampleRate: 24000 }),
    cache = new Map<string, Uint8Array>(),
    chunks: Uint8Array[] = []
  let size = 0
  try {
    for (const step of steps) {
      signal.throwIfAborted()
      let wav: Uint8Array
      if (step.side === "gap")
        wav = pcmReadingWav(
          new Int16Array(Math.round((step.seconds ?? 0) * context.sampleRate)),
          context.sampleRate,
        )
      else {
        const asset = step.asset!
        if (cache.has(asset.id)) wav = cache.get(asset.id)!
        else {
          if (
            Math.ceil(mp3Seconds(asset) * context.sampleRate) * 2 + 44 + size >
            MAX_TTS_EXPORT_AUDIO_BYTES
          )
            throw new Error("Audio quá dài để xuất MP3; hãy chia nhỏ bài.")
          const buffer = await context.decodeAudioData(Uint8Array.from(asset.bytes).buffer),
            samples = new Int16Array(buffer.length)
          signal.throwIfAborted()
          if (buffer.sampleRate !== context.sampleRate)
            throw new Error("Audio quá dài hoặc không đọc được.")
          for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = buffer.getChannelData(channel)
            for (let i = 0; i < data.length; i++)
              samples[i] = Math.max(
                -32768,
                Math.min(
                  32767,
                  samples[i]! + Math.round((data[i]! * 32767) / buffer.numberOfChannels),
                ),
              )
          }
          wav = pcmReadingWav(samples, buffer.sampleRate)
          cache.set(asset.id, wav)
        }
      }
      size += wav.length
      if (size > MAX_TTS_EXPORT_AUDIO_BYTES)
        throw new Error("MP3 quá dài. Giảm số lần lặp hoặc thời gian nghỉ.")
      chunks.push(wav)
    }
    return await encodeSpeechMp3(chunks, signal)
  } finally {
    await context.close()
  }
}
