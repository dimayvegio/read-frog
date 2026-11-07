import { getRandomUUID } from "@/utils/crypto-polyfill"
import {
  normalizeReadingText,
  MAX_READING_PAIRS,
  readingCaptureSchema,
  type ReadingCapture,
  type ReadingPair,
} from "./schema"

export function readingSentences(text: string): string[] {
  const sentences = [...new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(text)]
    .map((part) => part.segment.trim())
    .filter(Boolean)
  if (sentences.length > MAX_READING_PAIRS)
    throw new Error("Đoạn quá nhiều câu; chọn tối đa 120 câu mỗi bài.")
  return sentences
}
export function initialReadingPairs(input: ReadingCapture): {
  pairs: ReadingPair[]
  grouped: boolean
} {
  const capture = readingCaptureSchema.parse(input),
    original = readingSentences(capture.original),
    translation = readingSentences(capture.translation)
  const grouped = original.length !== translation.length
  const pairs = grouped
    ? [[capture.original, capture.translation]]
    : original.map((text, index) => [text, translation[index]!])
  return {
    grouped,
    pairs: pairs.map(([source, target]) => ({
      id: getRandomUUID(),
      original: source!,
      translation: target!,
      originalAudio: null,
      translationAudio: null,
      recording: null,
    })),
  }
}
export function parseReadingAlignment(text: string, input: ReadingCapture): ReadingPair[] {
  const capture = readingCaptureSchema.parse(input),
    original = readingSentences(capture.original),
    translation = readingSentences(capture.translation)
  if (text.length > 16000) throw new Error("Kết quả ghép câu quá dài.")
  const value: unknown = JSON.parse(text)
  if (
    !value ||
    typeof value !== "object" ||
    !("ends" in value) ||
    !Array.isArray(value.ends) ||
    !value.ends.length ||
    value.ends.length > MAX_READING_PAIRS
  )
    throw new Error("Kết quả ghép câu không hợp lệ.")
  let sourceStart = 0,
    targetStart = 0
  const pairs: ReadingPair[] = []
  for (const row of value.ends) {
    if (!Array.isArray(row) || row.length !== 2 || !row.every(Number.isInteger))
      throw new Error("Ranh giới câu không hợp lệ.")
    const [s, t] = row as [number, number]
    if (s < sourceStart || s >= original.length || t < targetStart || t >= translation.length)
      throw new Error("Ranh giới câu sai thứ tự.")
    pairs.push({
      id: getRandomUUID(),
      original: original.slice(sourceStart, s + 1).join(" "),
      translation: translation.slice(targetStart, t + 1).join(" "),
      originalAudio: null,
      translationAudio: null,
      recording: null,
    })
    sourceStart = s + 1
    targetStart = t + 1
  }
  if (
    sourceStart !== original.length ||
    targetStart !== translation.length ||
    normalizeReadingText(pairs.map((p) => p.original).join(" ")) !==
      normalizeReadingText(capture.original)
  )
    throw new Error("Kết quả ghép câu bị thiếu văn bản.")
  return pairs
}
