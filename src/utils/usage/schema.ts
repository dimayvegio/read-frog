import { z } from "zod"
export const usageTaskSchema = z.enum([
  "page",
  "subtitles",
  "selection",
  "pdf",
  "ocr",
  "image",
  "vocabulary",
  "tts",
  "summary",
  "segmentation",
  "customAction",
  "connection",
  "other",
])
export type UsageTask = z.infer<typeof usageTaskSchema>
const tokens = z.number().int().nonnegative().max(1e10).nullable()
export const usageEntrySchema = z.strictObject({
  id: z.string().uuid(),
  at: z.number().int().nonnegative(),
  task: usageTaskSchema,
  model: z.string().max(160),
  status: z.enum(["complete", "error", "cancelled", "cache"]),
  durationMs: z.number().nonnegative(),
  firstTokenMs: z.number().nonnegative().nullable(),
  input: tokens,
  output: tokens,
  cachedInput: tokens,
  cacheWrite: tokens,
  audioMs: z.number().nonnegative().nullable(),
})
export type UsageEntry = z.infer<typeof usageEntrySchema>
export const priceSchema = z.strictObject({
  model: z.string().trim().min(1).max(160),
  input: z.number().min(0).max(100000),
  output: z.number().min(0).max(100000),
  cachedInput: z.number().min(0).max(100000),
  audioMinute: z.number().min(0).max(10000).nullable(),
  checkedAt: z.string().max(40),
})
export type UsagePrice = z.infer<typeof priceSchema>
// Standard short-context USD / million tokens. Unknown models stay unpriced.
// Versioned, visible snapshot; never silently fetched from a third-party feed.
export const DEFAULT_PRICES: UsagePrice[] = [
  {
    model: "gpt-6-luna",
    input: 0.1,
    output: 0.5,
    cachedInput: 0.01,
    audioMinute: null,
    checkedAt: "2026-11-07",
  },
  {
    model: "gpt-6.1-sol",
    input: 2,
    output: 10,
    cachedInput: 0.1,
    audioMinute: null,
    checkedAt: "2026-11-07",
  },
  {
    model: "gpt-6.1-terra",
    input: 1,
    output: 5,
    cachedInput: 0.05,
    audioMinute: null,
    checkedAt: "2026-11-07",
  },
  {
    model: "gpt-6-astra",
    input: 10,
    output: 50,
    cachedInput: 1,
    audioMinute: null,
    checkedAt: "2026-11-07",
  },
]
export function estimateUsage(entry: UsageEntry, price?: UsagePrice): number | null {
  if (entry.status === "cache") return 0
  if (!price) return null
  if (entry.task === "tts")
    return price.audioMinute !== null && entry.audioMs !== null
      ? (entry.audioMs / 60000) * price.audioMinute
      : null
  // Missing final usage (including cancellation) is not zero-cost. Long-context
  // and cache-write tariffs require a separate price rule, not a guessed rate.
  if (
    entry.input === null ||
    entry.output === null ||
    entry.input > 272000 ||
    (entry.cacheWrite ?? 0) > 0
  )
    return null
  const cached = Math.min(entry.input, entry.cachedInput ?? 0)
  return (
    ((entry.input - cached) * price.input +
      cached * price.cachedInput +
      entry.output * price.output) /
    1e6
  )
}
export const USAGE_LABELS: Record<UsageTask, string> = {
  page: "Dịch trang / ô nhập",
  subtitles: "Phụ đề",
  selection: "Dịch bôi đen",
  pdf: "Dịch PDF",
  ocr: "OCR ảnh",
  image: "Đọc và dịch ảnh",
  vocabulary: "Tạo từ vựng",
  tts: "Giọng đọc OpenAI",
  summary: "Tóm tắt",
  segmentation: "Chia câu phụ đề",
  customAction: "Dictionary / AI Action",
  connection: "Kiểm tra kết nối",
  other: "Tác vụ khác",
}
