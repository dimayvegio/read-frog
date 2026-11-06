import { sha256 as portableSha256 } from "js-sha256"
import { z } from "zod"

export const VOCABULARY_PORT = "vocabulary-save"
export const REVIEW_MODES = ["flash", "choice", "type"] as const
export type ReviewMode = (typeof REVIEW_MODES)[number]
export type Grade = "again" | "hard" | "good" | "easy"
export const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024
export const MAX_CARDS = 2000
const text = (max: number) => z.string().trim().min(1).max(max)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const time = z.number().int().min(0).max(8_640_000_000_000_000)
export const notebookIdSchema = z.string().uuid()
export const notebookSchema = z.strictObject({
  id: notebookIdSchema,
  name: text(80),
  createdAt: time,
  updatedAt: time,
})
export type VocabularyNotebook = z.infer<typeof notebookSchema>
export interface NotebookSnapshot {
  notebooks: VocabularyNotebook[]
  activeNotebookId: string | null
}

export const captureSchema = z.strictObject({
  word: text(160),
  context: z.string().max(1800),
  sourceTitle: z.string().max(240),
  sourceUrl: z.string().max(2048),
  notebookId: notebookIdSchema.optional(),
})
export type VocabularyCapture = z.infer<typeof captureSchema>

// The AI supplies learning content only; IDs, source data and audio references
// are constructed locally. No provider configuration belongs in this schema.
export const generatedVocabularySchema = z.strictObject({
  word: text(160),
  language: text(24),
  ipa: z.string().max(240),
  partOfSpeech: text(100),
  meaning: text(600),
  definition: text(600),
  pronunciationTip: z.string().max(400),
  originalTranslation: z.string().max(1800),
  example: z.strictObject({ sentence: text(500), translation: text(600) }),
  distractors: z.array(text(300)).length(3),
  acceptedAnswers: z.array(text(160)).min(1).max(8),
  tags: z.array(text(40)).max(8),
})
export type GeneratedVocabulary = z.infer<typeof generatedVocabularySchema>
export const cardSchema = generatedVocabularySchema.extend({
  id: hash,
  captureKey: hash,
  createdAt: time,
  updatedAt: time,
  context: z.string().max(1800),
  sourceTitle: z.string().max(240),
  sourceUrl: z.string().max(2048),
  audio: z.strictObject({ word: hash, example: hash }),
  speech: z.strictObject({ model: text(100), voice: text(60), speed: z.number().min(0.25).max(4) }),
})
export type VocabularyCard = z.infer<typeof cardSchema>
export interface AudioAsset {
  id: string
  bytes: Uint8Array
  contentType: "audio/wav" | "audio/mpeg"
}

const stateSchema = z.strictObject({
  dueAt: time,
  intervalDays: z.number().min(0).max(36500),
  reviews: z.number().int().min(0).max(1_000_000),
  lapses: z.number().int().min(0).max(1_000_000),
  updatedAt: time,
})
export type ReviewState = z.infer<typeof stateSchema>
export const progressSchema = z.strictObject({
  cardId: hash,
  flash: stateSchema,
  choice: stateSchema,
  type: stateSchema,
})
export type CardProgress = z.infer<typeof progressSchema>
export interface VocabularyBundle {
  notebook?: VocabularyNotebook
  cards: VocabularyCard[]
  progress: CardProgress[]
  audio: AudioAsset[]
}
export interface VocabularySaveEvent {
  stage: "text" | "word-audio" | "example-audio" | "saved"
  cardId?: string
  duplicate?: boolean
  notebookId?: string
}

export function normalizeAnswer(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[‘’]/g, "'")
    .trim()
    .replace(/\s+/g, " ")
}
export function validateLearningContent(input: unknown): GeneratedVocabulary {
  const value = generatedVocabularySchema.parse(input)
  const choices = [value.meaning, ...value.distractors].map(normalizeAnswer)
  if (new Set(choices).size !== 4) throw new Error("Các lựa chọn trắc nghiệm bị trùng.")
  value.acceptedAnswers = [...new Set([value.word, ...value.acceptedAnswers])].slice(0, 8)
  return value
}
export function learningContentFromCard(card: VocabularyCard): GeneratedVocabulary {
  return {
    word: card.word,
    language: card.language,
    ipa: card.ipa,
    partOfSpeech: card.partOfSpeech,
    meaning: card.meaning,
    definition: card.definition,
    pronunciationTip: card.pronunciationTip,
    originalTranslation: card.originalTranslation,
    example: card.example,
    distractors: card.distractors,
    acceptedAnswers: card.acceptedAnswers,
    tags: card.tags,
  }
}
export function safeSourceUrl(value: string) {
  try {
    const url = new URL(value)
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return ""
    return url.href
  } catch {
    return ""
  }
}
export async function sha256(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value)
  // Local file viewers and HTTP hosts do not always expose SubtleCrypto.
  if (!globalThis.crypto?.subtle) return portableSha256(bytes)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("")
}
export function emptyProgress(cardId: string): CardProgress {
  const initial = (): ReviewState => ({
    dueAt: 0,
    intervalDays: 0,
    reviews: 0,
    lapses: 0,
    updatedAt: 0,
  })
  return { cardId, flash: initial(), choice: initial(), type: initial() }
}
export function scheduleReview(previous: ReviewState, grade: Grade, now = Date.now()): ReviewState {
  const base = previous.intervalDays
  const days =
    grade === "again"
      ? 1 / 1440
      : grade === "hard"
        ? Math.max(1, base * 1.2)
        : grade === "good"
          ? Math.max(1, base * 2.5)
          : Math.max(4, base * 3.5)
  const intervalDays = Math.min(36500, days)
  return {
    dueAt: now + Math.round(intervalDays * 86_400_000),
    intervalDays,
    reviews: Math.min(1_000_000, previous.reviews + 1),
    lapses: Math.min(1_000_000, previous.lapses + (grade === "again" ? 1 : 0)),
    updatedAt: now,
  }
}
export function mergeProgress(a: CardProgress | undefined, b: CardProgress): CardProgress {
  if (!a) return b
  return {
    cardId: b.cardId,
    ...Object.fromEntries(
      REVIEW_MODES.map((mode) => [mode, b[mode].updatedAt > a[mode].updatedAt ? b[mode] : a[mode]]),
    ),
  } as CardProgress
}
export function isWav(bytes: Uint8Array) {
  return (
    bytes.length >= 44 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WAVE"
  )
}
