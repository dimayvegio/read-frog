import { z } from "zod"

export const TRANSCRIPTION_PORT = "read-frog-audio-transcription-v1"
export const TRANSCRIPTION_MODEL = "gpt-transcribe"
export const SUBTITLE_TRANSCRIPTION_MODEL = "whisper-1"
export const MAX_AUDIO_FILE = 25_000_000
export const AUDIO_CHUNK = 192 * 1024
export const MAX_TRANSCRIPT = 500_000
export const formats = {
  mp3: "audio/mpeg",
  mpga: "audio/mpeg",
  mpeg: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  wav: "audio/wav",
  webm: "audio/webm",
  ogg: "audio/ogg",
  flac: "audio/flac",
} as const
export type AudioFormat = keyof typeof formats
export const languageCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/)
export const startSchema = z.strictObject({
  type: z.literal("start"),
  id: z.string().uuid(),
  format: z.enum(["mp3", "mpga", "mpeg", "m4a", "mp4", "wav", "webm", "ogg", "flac"]),
  size: z.number().int().min(16).max(MAX_AUDIO_FILE),
  languages: z
    .array(languageCode)
    .max(16)
    .refine((codes) => new Set(codes).size === codes.length),
  prompt: z.string().trim().max(1000),
  output: z.enum(["text", "subtitles"]).optional(),
})
export type TranscriptionStart = z.infer<typeof startSchema>
export type TranscriptionOptions = Pick<TranscriptionStart, "languages" | "prompt" | "output">
export interface TranscriptionSegment {
  start: number
  end: number
  text: string
}
export interface TranscriptionResult {
  text: string
  languages: string[]
  seconds: number | null
  model: typeof TRANSCRIPTION_MODEL | typeof SUBTITLE_TRANSCRIPTION_MODEL
  segments?: TranscriptionSegment[]
}
export type TranscriptionMessage =
  | { type: "ack"; id: string; index: number; loaded: number }
  | { type: "processing"; id: string }
  | { type: "text"; id: string; text: string }
  | { type: "done"; id: string; result: TranscriptionResult }
  | { type: "error"; id: string; message: string }
export function audioFormat(name: string): AudioFormat | null {
  const ext = name.split(".").at(-1)?.toLowerCase()
  return ext && Object.hasOwn(formats, ext) ? (ext as AudioFormat) : null
}
export function encodeAudioChunk(bytes: Uint8Array): string {
  let text = ""
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(text)
}
export function decodeAudioChunk(text: unknown): Uint8Array<ArrayBuffer> {
  if (
    typeof text !== "string" ||
    text.length > Math.ceil(AUDIO_CHUNK / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(text) ||
    text.length % 4
  )
    throw new Error("Gói âm thanh không hợp lệ.")
  let raw: string
  try {
    raw = atob(text)
  } catch {
    throw new Error("Gói âm thanh không hợp lệ.")
  }
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}
export function validateAudioHeader(bytes: Uint8Array, format: AudioFormat) {
  const tag = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length))
  const mp3 = tag(0, 3) === "ID3" || (bytes[0] === 255 && ((bytes[1] ?? 0) & 224) === 224)
  const valid =
    format === "wav"
      ? tag(0, 4) === "RIFF" && tag(8, 4) === "WAVE"
      : format === "m4a" || format === "mp4"
        ? tag(4, 4) === "ftyp"
        : format === "webm"
          ? bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
          : format === "ogg"
            ? tag(0, 4) === "OggS"
            : format === "flac"
              ? tag(0, 4) === "fLaC"
              : mp3
  if (!valid) throw new Error("Nội dung file không khớp định dạng âm thanh đã chọn.")
}
