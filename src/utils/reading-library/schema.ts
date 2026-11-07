import { z } from "zod"

export const READING_LAB_PORT = "reading-lab-alignment"
export const MAX_READING_TEXT = 20000
export const MAX_READING_PAIRS = 120
export const MAX_READING_ARCHIVE = 64 * 1024 * 1024
export const MAX_READING_ASSET = 8 * 1024 * 1024
export const MAX_READING_LIBRARY = 256 * 1024 * 1024
export const readingCaptureSchema = z.strictObject({
  original: z.string().trim().min(1).max(MAX_READING_TEXT),
  translation: z.string().trim().min(1).max(MAX_READING_TEXT),
  title: z.string().trim().max(160).default("Đoạn đọc mới"),
})
export type ReadingCapture = z.infer<typeof readingCaptureSchema>
const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const readingPairSchema = z.strictObject({
  id: z.string().uuid(),
  original: z.string().trim().min(1).max(MAX_READING_TEXT),
  translation: z.string().trim().min(1).max(MAX_READING_TEXT),
  originalAudio: hash.nullable(),
  translationAudio: hash.nullable(),
  recording: hash.nullable(),
})
export type ReadingPair = z.infer<typeof readingPairSchema>
export const readingFolderSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
})
export type ReadingFolder = z.infer<typeof readingFolderSchema>
export const readingPassageSchema = readingCaptureSchema.extend({
  id: z.string().uuid(),
  folderId: z.string().uuid().nullable(),
  favorite: z.boolean(),
  pairs: z.array(readingPairSchema).min(1).max(MAX_READING_PAIRS),
  // Frozen ZIP1 metadata, never executed as a provider request. Retired model/voice
  // names must remain readable for saved offline audio after runtime model updates.
  speech: z
    .strictObject({
      model: z.string().min(1).max(160),
      voice: z.string().min(1).max(80),
      speed: z.number().min(0.25).max(1.5),
      instructions: z.string().max(1000),
    })
    .nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
})
export type ReadingPassage = z.infer<typeof readingPassageSchema>
export interface ReadingAsset {
  id: string
  type: "audio/mpeg" | "audio/webm" | "audio/mp4" | "audio/ogg"
  bytes: Uint8Array
}
export interface ReadingBundle {
  passages: ReadingPassage[]
  folders: ReadingFolder[]
  assets: ReadingAsset[]
}
export const readingOptionsSchema = z.strictObject({
  gap: z.number().min(0).max(10),
  repeats: z.number().int().min(1).max(3),
  translation: z.boolean(),
})
export type ReadingOptions = z.infer<typeof readingOptionsSchema>
export const DEFAULT_READING_OPTIONS: ReadingOptions = { gap: 3, repeats: 1, translation: true }
export const normalizeReadingText = (text: string) => text.replace(/\s+/gu, " ").trim()
export function validateReadingPassage(input: unknown): ReadingPassage {
  const passage = readingPassageSchema.parse(input)
  if (
    new Set(passage.pairs.map((pair) => pair.id)).size !== passage.pairs.length ||
    normalizeReadingText(passage.pairs.map((pair) => pair.original).join(" ")) !==
      normalizeReadingText(passage.original) ||
    normalizeReadingText(passage.pairs.map((pair) => pair.translation).join(" ")) !==
      normalizeReadingText(passage.translation)
  )
    throw new Error("Các câu phải giữ đủ văn bản gốc và bản dịch, theo đúng thứ tự.")
  return passage
}
export function referencedReadingAssets(passage: ReadingPassage): string[] {
  return [
    ...new Set(
      passage.pairs
        .flatMap((pair) => [pair.originalAudio, pair.translationAudio, pair.recording])
        .filter((id): id is string => !!id),
    ),
  ]
}
