import { z } from "zod"
import { Sha256Hex } from "@/utils/hash"

export const PRONUNCIATION_PORT = "read-frog-pronunciation-v1"
export const PRONUNCIATION_MODEL = "gpt-audio-1.5"
export const PRONUNCIATION_RUBRIC = "en-us-v1"
export const MAX_WAV_BYTES = 44 + 16000 * 2 * 31
export const captureSchema = z.strictObject({
  text: z.string().trim().min(1).max(20000),
  context: z.string().max(2000).default(""),
})
export type PronunciationCapture = z.infer<typeof captureSchema>
export const referenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(1200)
  .refine(
    (text) => wordTokens(text).length > 0 && wordTokens(text).length <= 80,
    "Chọn từ hoặc đoạn tiếng Anh tối đa 80 từ / 1.200 ký tự.",
  )
export const requestSchema = z.strictObject({
  text: referenceSchema,
  context: z.string().max(2000),
  wav: z
    .string()
    .min(44)
    .max(Math.ceil(MAX_WAV_BYTES / 3) * 4),
})
export type PronunciationRequest = z.infer<typeof requestSchema>
export function wordTokens(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []
}
export const criterionKeys = ["sounds", "stress", "rhythm", "fluency", "accuracy"] as const
export const criterionLabels: Record<(typeof criterionKeys)[number], string> = {
  sounds: "Âm và độ rõ",
  stress: "Trọng âm từ",
  rhythm: "Nhịp và ngữ điệu",
  fluency: "Độ trôi chảy",
  accuracy: "Đọc đủ, đúng từ",
}
const halfScore = z
  .number()
  .min(0)
  .max(10)
  .refine((n) => Number.isInteger(n * 2))
const note = z.string().trim().min(1).max(1200)
const criterion = z.strictObject({ score: halfScore.nullable(), feedback: note })
export const feedbackSchema = z.strictObject({
  verdict: z.enum(["assessed", "retry"]),
  reason: z.enum([
    "ok",
    "silent",
    "noisy",
    "clipped",
    "unclear",
    "too_short",
    "not_english_reference",
    "not_english_audio",
    "off_task",
  ]),
  confidence: z.enum(["high", "medium", "low"]),
  heardText: z.string().max(2400),
  overview: note,
  strengths: z.array(note).max(4),
  criteria: z.strictObject({
    sounds: criterion,
    stress: criterion,
    rhythm: criterion,
    fluency: criterion,
    accuracy: criterion,
  }),
  findings: z
    .array(
      z.strictObject({
        wordStart: z.number().int().nonnegative().nullable(),
        wordEnd: z.number().int().nonnegative().nullable(),
        category: z.enum([
          "vowel",
          "consonant",
          "ending",
          "stress",
          "linking",
          "rhythm",
          "intonation",
          "fluency",
          "missing_word",
          "extra_word",
          "other",
        ]),
        heard: z.string().max(300),
        expected: note,
        explanation: note,
        practice: note,
        confidence: z.enum(["high", "medium"]),
      }),
    )
    .max(12),
  nextPractice: z.array(note).min(1).max(3),
})
export type PronunciationFeedback = z.infer<typeof feedbackSchema>
export function validateFeedback(value: unknown, text: string): PronunciationFeedback {
  const result = feedbackSchema.parse(value)
  const words = wordTokens(text)
  if (result.verdict === "retry") {
    if (
      result.reason === "ok" ||
      criterionKeys.some((k) => result.criteria[k].score !== null) ||
      result.findings.length
    )
      throw new Error("Kết quả yêu cầu thu lại không được có điểm hoặc lỗi phát âm suy đoán.")
  } else {
    if (
      result.reason !== "ok" ||
      result.confidence === "low" ||
      result.criteria.sounds.score === null ||
      result.criteria.accuracy.score === null
    )
      throw new Error("AI chưa nghe đủ rõ để chấm. Hãy thu lại.")
    if (
      words.length === 1 &&
      (result.criteria.rhythm.score !== null || result.criteria.fluency.score !== null)
    )
      throw new Error("Không chấm nhịp câu và trôi chảy cho một từ riêng lẻ.")
  }
  for (const finding of result.findings) {
    if (
      (finding.wordStart === null) !== (finding.wordEnd === null) ||
      (finding.wordStart !== null &&
        (finding.wordEnd! < finding.wordStart || finding.wordEnd! >= words.length))
    )
      throw new Error("Nhận xét AI không khớp vị trí từ trong đoạn đọc.")
    if (
      finding.wordStart === null &&
      !["rhythm", "intonation", "fluency", "extra_word", "other"].includes(finding.category)
    )
      throw new Error("Lỗi âm/từ cần vị trí từ cụ thể.")
  }
  return result
}
export function overallScore(feedback: PronunciationFeedback, text: string): number | null {
  if (feedback.verdict !== "assessed") return null
  const weights = wordTokens(text).length === 1 ? [50, 35, 0, 0, 15] : [40, 15, 20, 15, 10]
  let sum = 0,
    total = 0
  criterionKeys.forEach((k, i) => {
    const score = feedback.criteria[k].score
    if (score !== null) {
      sum += score * weights[i]!
      total += weights[i]!
    }
  })
  return total ? Math.round((sum / total) * 2) / 2 : null
}
export function referenceKey(text: string, context: string): string {
  return Sha256Hex(
    JSON.stringify([
      PRONUNCIATION_RUBRIC,
      PRONUNCIATION_MODEL,
      text.normalize("NFC").trim(),
      context.normalize("NFC").trim(),
    ]),
  )
}
export interface PronunciationAttempt {
  id: string
  evaluationKey: string
  referenceKey: string
  text: string
  context: string
  audioHash: string
  audioMs: number
  createdAt: number
  rubric: typeof PRONUNCIATION_RUBRIC
  model: string
  feedback: PronunciationFeedback
  score: number | null
}
export interface PronunciationResult {
  attempt: PronunciationAttempt
  cached: boolean
  saved: boolean
  epoch: number
}
