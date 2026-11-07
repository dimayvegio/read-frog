import type { ReviewEvent } from "./review-log"
import type { VocabularySource } from "./sources"
import { z } from "zod"
import { getRandomUUID } from "../crypto-polyfill"
import { assessVocabulary } from "./learning-assessment"
import { normalizeAnswer, type VocabularyCard, type CardProgress } from "./schema"

export type LearningMode = "today" | "weak" | "recall" | "dictation" | "cloze"
export type TaskKind = "recall" | "dictation" | "cloze"
export const learningTaskSchema = z.strictObject({
  id: z.string().uuid(),
  cardId: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(["recall", "dictation", "cloze"]),
  round: z.number().int().min(1).max(4),
  expected: z.string().min(1).max(160),
  accepted: z.array(z.string().max(160)).min(1).max(10),
  prompt: z.string().max(1800),
})
export type LearningTask = z.infer<typeof learningTaskSchema>
const stateSchema = z.strictObject({
  dueAt: z.number(),
  intervalDays: z.number(),
  reviews: z.number(),
  lapses: z.number(),
  updatedAt: z.number(),
})
export const learningRunSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().uuid(),
  notebookId: z.string().uuid(),
  mode: z.enum(["today", "weak", "recall", "dictation", "cloze"]),
  createdAt: z.number(),
  updatedAt: z.number(),
  queue: z.array(learningTaskSchema).max(120),
  cursor: z.number().int().min(0).max(120),
  phase: z.enum(["study", "question", "feedback", "correction", "done"]),
  introduced: z.array(z.string()).max(10),
  hint: z.enum(["none", "first-letter", "partial", "answer"]),
  pasted: z.boolean(),
  replays: z.number().int().min(0).max(1000),
  feedback: z
    .strictObject({
      result: z.enum(["correct", "incorrect", "revealed"]),
      answer: z.string().max(300),
      eventId: z.string().uuid(),
    })
    .nullable(),
  correctionId: z.string().uuid(),
  corrected: z.boolean(),
  scheduled: z.record(
    z.string(),
    z.strictObject({
      baseline: stateSchema,
      worst: z.enum(["again", "good"]),
      lastScheduleUpdatedAt: z.number(),
      externallyAdvanced: z.boolean(),
    }),
  ),
  retries: z.record(z.string(), z.number().int().min(0).max(2)),
})
export type LearningRun = z.infer<typeof learningRunSchema>

function wholeMatches(text: string, candidate: string) {
  const regex = new RegExp(candidate.normalize("NFC").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu")
  return [...text.matchAll(regex)].filter((match) => {
    const start = match.index,
      end = start + match[0].length
    return (
      !(start && /[\p{L}\p{N}_]/u.test(text[start - 1]!)) &&
      !(end < text.length && /[\p{L}\p{N}_]/u.test(text[end]!))
    )
  })
}

export function clozeFor(
  card: VocabularyCard,
  contexts: readonly string[] = [],
): { prompt: string; expected: string } | null {
  const candidates = [...new Set([card.word, ...card.acceptedAnswers])]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  for (const sentence of [...contexts, card.example.sentence, card.context]) {
    const text = sentence.normalize("NFC")
    for (const candidate of candidates) {
      for (const match of wholeMatches(text, candidate)) {
        const start = match.index,
          end = start + match[0].length
        // Never expose another occurrence of an accepted answer in the cue.
        const prompt = text.slice(0, start) + "_____" + text.slice(end)
        if (candidates.some((value) => wholeMatches(prompt, value).length)) continue
        const offset = Math.min(start, Math.max(0, prompt.length - 1800))
        return { prompt: prompt.slice(offset, offset + 1800), expected: match[0] }
      }
    }
  }
  return null
}
export function taskFor(
  card: VocabularyCard,
  kind: TaskKind,
  round: number,
  contexts: readonly string[] = [],
): LearningTask | null {
  const offset = contexts.length ? (round - 1) % contexts.length : 0
  const rotated = [...contexts.slice(offset), ...contexts.slice(0, offset)]
  const gap = kind === "cloze" ? clozeFor(card, rotated) : null
  if (kind === "cloze" && !gap) return null
  return {
    id: getRandomUUID(),
    cardId: card.id,
    kind,
    round,
    expected: gap?.expected ?? card.word,
    accepted: [...new Set([gap?.expected ?? card.word, ...card.acceptedAnswers])].slice(0, 10),
    prompt: gap?.prompt ?? (kind === "recall" ? card.meaning : "Nghe từ và gõ lại."),
  }
}
export function createLearningRun(
  notebookId: string,
  cards: VocabularyCard[],
  events: ReviewEvent[],
  progress: CardProgress[],
  mode: LearningMode,
  now = Date.now(),
  sources: readonly VocabularySource[] = [],
): LearningRun {
  const contexts = new Map<string, string[]>()
  for (const source of sources)
    contexts.set(source.cardId, [...(contexts.get(source.cardId) ?? []), source.context])
  const assessment = assessVocabulary(events, cards),
    weak = new Set(assessment.needsReview.map((word) => word.cardId)),
    byProgress = new Map(progress.map((row) => [row.cardId, row]))
  const ordered = [...cards].sort(
    (a, b) =>
      Number(weak.has(b.id)) - Number(weak.has(a.id)) ||
      (byProgress.get(a.id)?.type.dueAt ?? 0) - (byProgress.get(b.id)?.type.dueAt ?? 0),
  )
  let selected: VocabularyCard[]
  if (mode === "today") {
    const known = ordered
      .filter(
        (card) =>
          (byProgress.get(card.id)?.type.reviews ?? 0) > 0 &&
          (weak.has(card.id) || byProgress.get(card.id)!.type.dueAt <= now),
      )
      .slice(0, 5)
    const fresh = ordered
      .filter(
        (card) =>
          !known.some((value) => value.id === card.id) && !byProgress.get(card.id)?.type.reviews,
      )
      .slice(0, 5)
    selected = [...known, ...fresh]
  } else
    selected = ordered
      .filter((card) => mode !== "weak" || weak.has(card.id))
      .filter((card) => mode !== "cloze" || clozeFor(card, contexts.get(card.id)))
      .slice(0, 10)
  const queue: LearningTask[] = []
  for (let round = 1; round <= 3; round++)
    for (const card of selected) {
      const kind: TaskKind =
        mode === "today" || mode === "weak"
          ? (["recall", "dictation", "cloze"] as const)[round - 1]!
          : mode
      const task =
        taskFor(card, kind, round, contexts.get(card.id)) ?? taskFor(card, "recall", round)!
      queue.push(task)
    }
  const run: LearningRun = {
    version: 1,
    id: getRandomUUID(),
    notebookId,
    mode,
    createdAt: now,
    updatedAt: now,
    queue,
    cursor: 0,
    phase: queue.length ? "question" : "done",
    introduced: selected
      .filter((card) => (byProgress.get(card.id)?.type.reviews ?? 0) > 0)
      .map((card) => card.id),
    hint: "none",
    pasted: false,
    replays: 0,
    feedback: null,
    correctionId: getRandomUUID(),
    corrected: false,
    scheduled: {},
    retries: {},
  }
  if (mode === "today" && queue[0] && !byProgress.get(queue[0].cardId)?.type.reviews)
    run.phase = "study"
  return run
}
export function currentLearningTask(run: LearningRun) {
  return run.queue[run.cursor]
}
export function advanceLearningRun(
  run: LearningRun,
  existingCards: VocabularyCard[],
  now = Date.now(),
): LearningRun {
  const next = structuredClone(run),
    task = currentLearningTask(next)
  if (
    task &&
    next.feedback &&
    (next.feedback.result !== "correct" || next.hint !== "none" || next.pasted) &&
    (next.retries[task.cardId] ?? 0) < 2
  ) {
    next.retries[task.cardId] = (next.retries[task.cardId] ?? 0) + 1
    next.queue.splice(Math.min(next.cursor + 4, next.queue.length), 0, {
      ...task,
      id: getRandomUUID(),
      round: 4,
    })
  }
  next.cursor++
  const ids = new Set(existingCards.map((card) => card.id))
  while (currentLearningTask(next) && !ids.has(currentLearningTask(next)!.cardId)) next.cursor++
  next.phase = currentLearningTask(next) ? "question" : "done"
  const following = currentLearningTask(next)
  if (
    following &&
    next.mode === "today" &&
    !next.introduced.includes(following.cardId) &&
    !next.scheduled[following.cardId]
  )
    next.phase = "study"
  next.hint = "none"
  next.pasted = false
  next.replays = 0
  next.feedback = null
  next.corrected = false
  next.correctionId = getRandomUUID()
  next.updatedAt = now
  return learningRunSchema.parse(next)
}
export function answerMatches(task: LearningTask, answer: string) {
  return task.accepted.some((value) => normalizeAnswer(value) === normalizeAnswer(answer))
}
export function spellingDiff(expected: string, answer: string) {
  const a = Array.from(answer.normalize("NFC")),
    b = Array.from(expected.normalize("NFC")),
    matrix = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  for (let i = 0; i <= a.length; i++) matrix[i]![0] = i
  for (let j = 0; j <= b.length; j++) matrix[0]![j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + Number(a[i - 1] !== b[j - 1]),
      )
  const original: { text: string; changed: boolean }[] = [],
    target: { text: string; changed: boolean }[] = []
  let i = a.length,
    j = b.length
  while (i || j) {
    if (i && j && matrix[i]![j] === matrix[i - 1]![j - 1]! + Number(a[i - 1] !== b[j - 1])) {
      const changed = a[i - 1] !== b[j - 1]
      original.unshift({ text: a[--i]!, changed })
      target.unshift({ text: b[--j]!, changed })
    } else if (i && matrix[i]![j] === matrix[i - 1]![j]! + 1)
      original.unshift({ text: a[--i]!, changed: true })
    else target.unshift({ text: b[--j]!, changed: true })
  }
  return { original, target }
}
