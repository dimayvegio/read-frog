import { z } from "zod"
import { criterionKeys, validateFeedback, wordTokens, type PronunciationFeedback } from "./schema"

type ResponseCode = "PA-JSON" | "PA-SHAPE" | "PA-SCORE" | "PA-WORD"
const safeFields = new Set([
  "verdict",
  "reason",
  "confidence",
  "heardText",
  "overview",
  "strengths",
  "criteria",
  ...criterionKeys,
  "score",
  "feedback",
  "findings",
  "wordStart",
  "wordEnd",
  "category",
  "heard",
  "expected",
  "explanation",
  "practice",
  "nextPractice",
])
/** Safe diagnostic codes/field names only, never a provider value or raw response. */
export class PronunciationResponseError extends Error {
  constructor(
    readonly code: ResponseCode,
    paths: PropertyKey[][] = [],
  ) {
    const fields = [
      ...new Set(
        paths
          .map((path) =>
            path.filter((part) => typeof part === "string" && safeFields.has(part)).join("."),
          )
          .filter(Boolean),
      ),
    ].slice(0, 6)
    const detail =
      code === "PA-JSON"
        ? "AI chưa trả về JSON đọc được"
        : code === "PA-SCORE"
          ? "Điểm tiêu chí AI trả về không hợp lệ"
          : code === "PA-WORD"
            ? "Vị trí từ trong nhận xét AI không khớp đoạn đọc"
            : "Phản hồi AI thiếu hoặc sai trường nhận xét"
    super(
      `${detail}${fields.length ? ` (${fields.join(", ")})` : ""}. Chưa ghi điểm. Mã ${code}; có thể bấm Chấm phát âm lại với bản thu hiện tại.`,
    )
  }
}
const reasons = [
  "ok",
  "silent",
  "noisy",
  "clipped",
  "unclear",
  "too_short",
  "not_english_reference",
  "not_english_audio",
  "off_task",
] as const
const note = z.string().trim().min(1).max(1200)
const headerSchema = z.object({
  verdict: z.enum(["assessed", "retry"]),
  reason: z.enum(reasons),
  confidence: z.enum(["high", "medium", "low"]),
})
const rawScore = z.union([z.number().finite(), z.string().trim().max(32), z.null()])
const criterion = z.object({ score: rawScore, feedback: note })
const stringList = (max: number) =>
  z.union([note.transform((text) => [text]), z.array(note).max(max)])
const wireSchema = headerSchema.extend({
  heardText: z.string().max(2400).nullable().optional(),
  overview: note,
  strengths: stringList(4).default([]),
  criteria: z.object({
    sounds: criterion,
    stress: criterion.optional(),
    accuracy: criterion,
    rhythm: criterion.optional(),
    fluency: criterion.optional(),
  }),
  findings: z
    .array(
      z.object({
        wordStart: z.number().int().nonnegative().nullable().optional(),
        wordEnd: z.number().int().nonnegative().nullable().optional(),
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
        heard: z.string().max(300).nullable().optional(),
        expected: note,
        explanation: note,
        practice: note,
        confidence: z.enum(["high", "medium"]),
      }),
    )
    .max(12)
    .default([]),
  nextPractice: stringList(3).refine((items) => items.length > 0),
})
const notApplicable = () => ({
  score: null,
  feedback: "Không áp dụng cho một từ riêng lẻ; không tính vào điểm tổng.",
})
const retryAdvice: Record<Exclude<(typeof reasons)[number], "ok">, string> = {
  silent: "Nói rõ từ/câu vào micro, nghe lại bản thu trước khi chấm.",
  noisy: "Thu lại ở nơi yên tĩnh, đưa micro gần miệng và tránh tiếng loa lọt vào.",
  clipped: "Giảm âm lượng micro, giữ khoảng cách ổn định rồi thu lại.",
  unclear:
    "Thu lại từ/câu rõ ràng, giữ một khoảng ngắn trước và sau khi nói; nghe lại để kiểm tra.",
  too_short: "Đừng cắt mất đầu hoặc âm cuối của từ; dừng thu sau khi nói xong một nhịp.",
  not_english_reference: "Chọn một từ hoặc câu tiếng Anh để luyện phát âm Mỹ.",
  not_english_audio: "Đọc đúng từ/câu tiếng Anh đang hiển thị rồi thu lại.",
  off_task: "Đọc đúng từ/câu đang hiển thị, không đọc phần hướng dẫn.",
}
function qualityRetry(header: z.infer<typeof headerSchema>): PronunciationFeedback {
  const reason = header.reason === "ok" ? "unclear" : header.reason
  const feedback = retryAdvice[reason]
  return {
    verdict: "retry",
    reason,
    confidence: "low",
    heardText: "",
    overview: "AI chưa có đủ căn cứ để chấm bản thu này. Cần thu lại; chưa cho điểm phát âm.",
    strengths: [],
    criteria: {
      sounds: { score: null, feedback },
      stress: { score: null, feedback },
      rhythm: { score: null, feedback },
      fluency: { score: null, feedback },
      accuracy: { score: null, feedback },
    },
    findings: [],
    nextPractice: [feedback],
  }
}
function score(value: z.infer<typeof rawScore>, key: string): number | null {
  if (value === null) return null
  if (typeof value === "string") {
    if (/^(?:n\/?a|not applicable|null)$/i.test(value)) return null
    // A quoted Vietnamese decimal with one/two fractional digits is unambiguous;
    // thousands separators, percentages and arbitrary prose remain invalid.
    if (/^(?:10,0{1,2}|[0-9],[0-9]{1,2})(?:\s*\/\s*10)?$/.test(value))
      value = value.replace(",", ".")
    if (!/^(?:10(?:\.0+)?|[0-9](?:\.\d+)?)(?:\s*\/\s*10)?$/.test(value))
      throw new PronunciationResponseError("PA-SCORE", [["criteria", key, "score"]])
    value = Number(value.split("/")[0]!.trim())
  }
  if (!Number.isFinite(value) || value < 0 || value > 10)
    throw new PronunciationResponseError("PA-SCORE", [["criteria", key, "score"]])
  return Math.round(value * 2) / 2
}
function jsonObject(text: string): unknown {
  let json = text.trim().replace(/^\uFEFF/, "")
  if (json.length > 60000) throw new PronunciationResponseError("PA-JSON")
  // Only an enclosing single fence is removed; never scrape arbitrary prose or repair JSON values.
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/i.exec(json)
  if (fence) json = fence[1]!.trim()
  try {
    return JSON.parse(json) as unknown
  } catch {
    throw new PronunciationResponseError("PA-JSON")
  }
}
export function parsePronunciationFeedback(content: string, text: string): PronunciationFeedback {
  const value = jsonObject(content)
  const header = headerSchema.safeParse(value)
  if (!header.success)
    throw new PronunciationResponseError(
      "PA-SHAPE",
      header.error.issues.map((issue) => issue.path),
    )
  // Downgrading uncertainty can never create a grade, even if the model included scores.
  if (
    header.data.verdict === "retry" ||
    header.data.confidence === "low" ||
    header.data.reason !== "ok"
  )
    return validateFeedback(qualityRetry(header.data), text)
  const singleWord = wordTokens(text).length === 1
  // These are app-owned N/A fields. Ignore model scores/shape for them on isolated words.
  const raw = value as Record<string, unknown>
  const rawCriteria =
    raw.criteria && typeof raw.criteria === "object" && !Array.isArray(raw.criteria)
      ? (raw.criteria as Record<string, unknown>)
      : null
  const input =
    singleWord && rawCriteria
      ? {
          ...raw,
          criteria: {
            ...rawCriteria,
            rhythm: notApplicable(),
            fluency: notApplicable(),
            stress: rawCriteria.stress ?? {
              score: null,
              feedback: "AI không cung cấp đủ căn cứ đánh giá trọng âm ở lượt này.",
            },
          },
        }
      : value
  const parsed = wireSchema.safeParse(input)
  if (!parsed.success)
    throw new PronunciationResponseError(
      "PA-SHAPE",
      parsed.error.issues.map((issue) => issue.path),
    )
  const data = parsed.data
  const criteria: PronunciationFeedback["criteria"] = {
    sounds: notApplicable(),
    stress: notApplicable(),
    rhythm: notApplicable(),
    fluency: notApplicable(),
    accuracy: notApplicable(),
  }
  for (const key of criterionKeys) {
    const item = data.criteria[key]
    if (!item) throw new PronunciationResponseError("PA-SHAPE", [["criteria", key]])
    criteria[key] = { score: score(item.score, key), feedback: item.feedback }
  }
  if (criteria.sounds.score === null || criteria.accuracy.score === null)
    return validateFeedback(qualityRetry({ ...header.data, reason: "unclear" }), text)
  const findings = data.findings
    .filter(
      (finding) =>
        !singleWord || !["rhythm", "intonation", "fluency", "linking"].includes(finding.category),
    )
    .map((finding) => {
      let wordStart = finding.wordStart ?? null,
        wordEnd = finding.wordEnd ?? null
      // With exactly one reference word, omitted or one-based [1,1] indices have one possible target.
      if (
        singleWord &&
        ((wordStart === null && wordEnd === null) || (wordStart === 1 && wordEnd === 1))
      ) {
        wordStart = 0
        wordEnd = 0
      }
      return { ...finding, wordStart, wordEnd, heard: finding.heard ?? "" }
    })
  const feedback = {
    ...header.data,
    heardText: data.heardText ?? "",
    overview: data.overview,
    strengths: data.strengths,
    criteria,
    findings,
    nextPractice: data.nextPractice,
  }
  try {
    return validateFeedback(feedback, text)
  } catch {
    throw new PronunciationResponseError("PA-WORD", [
      ["findings", "wordStart"],
      ["findings", "wordEnd"],
    ])
  }
}
