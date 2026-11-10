import { z } from "zod"
import {
  languageCode,
  MAX_TRANSCRIPT,
  TRANSCRIPTION_MODEL,
  type TranscriptionResult,
} from "./schema"
import { subtitleResult } from "./subtitles"

const usageSchema = z.union([
  z.object({ type: z.literal("duration"), seconds: z.number().finite().nonnegative().max(86400) }),
  z.object({
    type: z.literal("tokens"),
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
])
const finalSchema = z.object({
  text: z.string().max(MAX_TRANSCRIPT),
  languages: z
    .array(z.object({ code: languageCode }))
    .max(64)
    .optional(),
  usage: z.unknown().optional(),
})
export function transcriptionFinal(value: unknown) {
  const parsed = finalSchema.safeParse(value)
  if (!parsed.success) throw new Error("OpenAI trả bản chép lời chưa hợp lệ.")
  const usage = usageSchema.safeParse(parsed.data.usage)
  const result: TranscriptionResult = {
    text: parsed.data.text,
    languages: [...new Set(parsed.data.languages?.map((item) => item.code) ?? [])],
    seconds: usage.success && usage.data.type === "duration" ? usage.data.seconds : null,
    model: TRANSCRIPTION_MODEL,
  }
  return { result, usage: usage.success ? usage.data : null }
}
/** Bounded UTF-8/SSE reader; partial text is never mistaken for a completed transcript. */
export async function readTranscriptionResponse(
  response: Response,
  signal: AbortSignal,
  onText: (text: string) => void,
  timed = false,
) {
  if (!response.body) throw new Error("OpenAI không trả về bản chép lời.")
  const reader = response.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true })
  const abortRead = () => {
    void reader.cancel().catch(() => {})
  }
  signal.addEventListener("abort", abortRead, { once: true })
  const streaming = response.headers.get("content-type")?.includes("text/event-stream")
  let bytes = 0,
    buffer = "",
    text = "",
    events = 0
  const event = (block: string) => {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
    if (!data || data === "[DONE]") return null
    if (++events > 100000) throw new Error("Phản hồi chép lời vượt giới hạn.")
    let value: unknown
    try {
      value = JSON.parse(data)
    } catch {
      throw new Error("Luồng chép lời bị lỗi định dạng.")
    }
    if (!value || typeof value !== "object") throw new Error("Luồng chép lời bị lỗi định dạng.")
    const item = value as Record<string, unknown>
    if (item.type === "transcript.text.delta") {
      if (typeof item.delta !== "string" || text.length + item.delta.length > MAX_TRANSCRIPT)
        throw new Error("Bản chép lời vượt giới hạn.")
      text += item.delta
      onText(text)
    } else if (item.type === "transcript.text.done") return transcriptionFinal(item)
    else if (item.type === "error" || item.error)
      throw new Error("OpenAI chưa hoàn tất chép lời. Bạn có thể thử lại.")
    return null
  }
  try {
    if (timed && streaming)
      throw new Error("Timed transcription requires a completed timestamp response")
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      bytes += value.length
      if (bytes > 8 * 1024 * 1024) throw new Error("Phản hồi chép lời vượt giới hạn.")
      // Preserve a CR split across network chunks, then canonicalize event separators.
      buffer += decoder.decode(value, { stream: true })
      if (!streaming) continue
      buffer = buffer.replaceAll("\r\n", "\n")
      let at: number
      while ((at = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, at)
        buffer = buffer.slice(at + 2)
        const final = event(block)
        if (final) return final
      }
      if (buffer.length > 2 * 1024 * 1024) throw new Error("Phản hồi chép lời vượt giới hạn.")
    }
    buffer += decoder.decode()
    if (streaming) {
      const final = event(buffer.replaceAll("\r\n", "\n"))
      if (final) return final
      throw new Error("Kết nối kết thúc trước khi có bản chép lời hoàn chỉnh.")
    }
    let value: unknown
    try {
      value = JSON.parse(buffer)
    } catch {
      throw new Error("OpenAI trả bản chép lời chưa hợp lệ.")
    }
    if (timed) {
      const result = subtitleResult(value)
      const usage = usageSchema.safeParse(
        value && typeof value === "object" && "usage" in value ? value.usage : null,
      )
      if (usage.success && usage.data.type === "duration") result.seconds = usage.data.seconds
      return { result, usage: usage.success ? usage.data : null }
    }
    return transcriptionFinal(value)
  } finally {
    signal.removeEventListener("abort", abortRead)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
