import { z } from "zod"
import {
  MAX_TRANSCRIPT,
  SUBTITLE_TRANSCRIPTION_MODEL,
  type TranscriptionResult,
  type TranscriptionSegment,
} from "./schema"

export const segmentSchema = z.object({
  start: z.number().finite().min(0).max(86400),
  end: z.number().finite().min(0).max(86400),
  text: z.string().max(10000),
})
const timedSchema = z.object({
  text: z.string().max(MAX_TRANSCRIPT),
  duration: z.number().finite().nonnegative().max(86400),
  segments: z.array(segmentSchema).max(20000),
})
/** Provider timestamps only: no interpolation from text length or elapsed UI time. */
export function subtitleResult(raw: unknown): TranscriptionResult {
  const result = timedSchema.parse(raw)
  let previousEnd = 0,
    total = 0
  const segments = result.segments.map((segment) => {
    const text = segment.text.normalize("NFC").replaceAll(/\r\n?/g, "\n").trim()
    total += text.length
    if (
      !text ||
      text.includes("\0") ||
      text.includes("-->") ||
      total > MAX_TRANSCRIPT ||
      Math.round(segment.start * 1000) < Math.round(previousEnd * 1000) ||
      segment.end <= segment.start ||
      segment.end > result.duration + 0.05 ||
      Math.round(segment.end * 1000) <= Math.round(segment.start * 1000)
    )
      throw new Error("Invalid subtitle timeline")
    previousEnd = segment.end
    return { start: segment.start, end: segment.end, text }
  })
  if (result.text.trim() && !segments.length) throw new Error("Missing subtitle timestamps")
  return {
    text: result.text,
    model: SUBTITLE_TRANSCRIPTION_MODEL,
    seconds: null,
    languages: [],
    segments,
  }
}
export function subtitleTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400)
    throw new Error("Invalid subtitle time")
  const ms = Math.round(seconds * 1000)
  const pad = (value: number, length = 2) => String(value).padStart(length, "0")
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`
}
export function toSrt(segments: TranscriptionSegment[]): string {
  if (!segments.length) return ""
  // Revalidate before export as well; edited/partial plaintext cannot invent cues.
  const validated = subtitleResult({
    text: segments.map((row) => row.text).join(" "),
    duration: segments.at(-1)?.end,
    segments,
  })
  return validated
    .segments!.map(
      (row, index) =>
        `${index + 1}\r\n${subtitleTimestamp(row.start)} --> ${subtitleTimestamp(row.end)}\r\n${row.text.replaceAll(/\n{2,}/g, "\n").replaceAll("\n", "\r\n")}\r\n`,
    )
    .join("\r\n")
}
