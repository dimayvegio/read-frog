import { z } from "zod"
import { assessVocabulary, type StudyWord } from "./learning-assessment"

export const MAX_REVIEW_EVENTS = 20000
export const MAX_REVIEW_LOG_BYTES = 16 * 1024 * 1024
const time = z.number().int().min(0).max(8_640_000_000_000_000)
export const reviewEventSchema = z
  .strictObject({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    cardId: z.string().regex(/^[a-f0-9]{64}$/),
    occurredAt: time,
    mode: z.enum(["flash", "choice", "type"]),
    result: z.enum(["correct", "incorrect", "revealed", "self"]),
    word: z.string().min(1).max(160),
    language: z.string().max(24),
    meaning: z.string().max(200),
    answer: z.string().max(300),
    elapsedMs: z.number().int().min(0).max(3_600_000),
    grade: z.enum(["again", "hard", "good", "easy"]).nullable(),
    gradedAt: time,
  })
  .superRefine((event, ctx) => {
    if (
      (event.grade === null) !== (event.gradedAt === 0) ||
      (event.mode === "flash" && event.result !== "self") ||
      (event.result === "self" && !event.grade)
    )
      ctx.addIssue({ code: "custom", message: "Invalid review assessment" })
  })
export type ReviewEvent = z.infer<typeof reviewEventSchema>
export interface ReviewAttempt {
  id: string
  sessionId: string
  elapsedMs: number
}
export const sameReviewAnswer = (a: ReviewEvent, b: ReviewEvent) =>
  JSON.stringify({ ...a, grade: null, gradedAt: 0 }) ===
  JSON.stringify({ ...b, grade: null, gradedAt: 0 })

export function summarizeReviewEvents(events: ReviewEvent[]) {
  const correct = events.filter((e) => e.result === "correct").length,
    incorrect = events.filter((e) => e.result === "incorrect").length,
    objective = correct + incorrect
  const durations = events
    .filter((e) => e.result === "correct" || e.result === "incorrect")
    .map((e) => e.elapsedMs)
    .sort((a, b) => a - b)
  return {
    attempts: events.length,
    uniqueWords: new Set(events.map((e) => e.cardId)).size,
    uniqueScoredWords: new Set(
      events.filter((e) => e.result === "correct" || e.result === "incorrect").map((e) => e.cardId),
    ).size,
    correct,
    incorrect,
    revealed: events.filter((e) => e.result === "revealed").length,
    selfRated: events.filter((e) => e.result === "self").length,
    graded: events.filter((e) => e.grade !== null).length,
    accuracyPercent: objective ? Math.round((correct / objective) * 1000) / 10 : null,
    unassistedRecallPercent:
      objective + events.filter((e) => e.result === "revealed").length
        ? Math.round(
            (correct / (objective + events.filter((e) => e.result === "revealed").length)) * 1000,
          ) / 10
        : null,
    medianResponseMs: durations.length
      ? Math.round(
          (durations[Math.floor((durations.length - 1) / 2)]! +
            durations[Math.floor(durations.length / 2)]!) /
            2,
        )
      : null,
    sessions: new Set(events.map((e) => e.sessionId)).size,
  }
}

export function createReviewReport(
  notebook: { id: string; name: string } | null,
  events: ReviewEvent[],
  options: { now?: number; days?: number; timeZone?: string; cards?: readonly StudyWord[] } = {},
) {
  const now = options.now ?? Date.now(),
    timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const from = options.days ? now - options.days * 86_400_000 : null
  const selected = events
    .filter((e) => from === null || e.occurredAt >= from)
    .sort((a, b) => a.occurredAt - b.occurredAt || a.id.localeCompare(b.id))
  const words = new Map<string, ReviewEvent[]>(),
    days = new Map<string, ReviewEvent[]>(),
    languages = new Map<string, ReviewEvent[]>()
  const calendar = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  for (const event of selected) {
    const parts = Object.fromEntries(
      calendar.formatToParts(event.occurredAt).map((part) => [part.type, part.value]),
    )
    const day = `${parts.year}-${parts.month}-${parts.day}`
    for (const [map, key] of [
      [words, event.cardId],
      [days, day],
      [languages, event.language],
    ] as const) {
      const group = map.get(key)
      if (group) group.push(event)
      else map.set(key, [event])
    }
  }
  return {
    format: "read-frog-review-report",
    version: 2,
    exportedAt: now,
    timeZone,
    notebook,
    period: {
      from,
      to: now,
      firstRecordedAt: events.length ? Math.min(...events.map((e) => e.occurredAt)) : null,
    },
    assessment: assessVocabulary(events, options.cards),
    interpretation: [
      "Counts are unique recorded attempts, not the number of times a card was displayed.",
      "Accuracy includes only automatically checked first answers in choice/type modes. Revealed answers and flashcard self-ratings are separate.",
      "Response time measures visible study time up to the first answer, capped at one hour; it can include distractions.",
      "Older schedule counters are not reconstructed into logs. Missing logs do not mean no prior learning.",
      "Unassisted recall counts revealed answers as not recalled. Meaning/answer snapshots can be truncated; source URLs and full source passages are excluded.",
      "Results describe this vocabulary set; they do not establish CEFR or overall language proficiency.",
    ],
    summary: summarizeReviewEvents(selected),
    byMode: Object.fromEntries(
      ["flash", "choice", "type"].map((mode) => [
        mode,
        summarizeReviewEvents(selected.filter((e) => e.mode === mode)),
      ]),
    ),
    byLanguage: [...languages].map(([language, logs]) => ({
      language,
      ...summarizeReviewEvents(logs),
    })),
    daily: [...days].map(([day, logs]) => ({ day, ...summarizeReviewEvents(logs) })),
    words: [...words]
      .map(([cardId, logs]) => ({
        cardId,
        word: logs.at(-1)!.word,
        meaning: logs.at(-1)!.meaning,
        language: logs.at(-1)!.language,
        lastAttemptAt: logs.at(-1)!.occurredAt,
        ...summarizeReviewEvents(logs),
      }))
      .sort(
        (a, b) => b.incorrect + b.revealed - a.incorrect - a.revealed || b.attempts - a.attempts,
      ),
    events: selected,
  }
}
