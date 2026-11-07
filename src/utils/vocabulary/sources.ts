import { z } from "zod"
import { normalizeAnswer, safeSourceUrl, sha256, type VocabularyCapture } from "./schema"
import { sourceLocatorSchema } from "./source-locator"
export { sourceLocatorSchema } from "./source-locator"
export type { SourceLocator } from "./source-locator"

export const MAX_CARD_SOURCES = 20
export const MAX_SOURCES = 20000
export const MAX_SOURCE_BYTES = 4 * 1024 * 1024
export const vocabularySourceSchema = z.strictObject({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  cardId: z.string().regex(/^[a-f0-9]{64}$/),
  context: z.string().trim().min(1).max(1800),
  translation: z.string().max(1800),
  title: z.string().max(240),
  url: z
    .string()
    .max(2048)
    .refine((url) => !url || safeSourceUrl(url) === url),
  locator: sourceLocatorSchema,
  createdAt: z.number().int().nonnegative(),
})
export type VocabularySource = z.infer<typeof vocabularySourceSchema>

export async function sourceFromCapture(
  cardId: string,
  capture: VocabularyCapture,
  translation = "",
): Promise<VocabularySource | null> {
  const context = capture.context.normalize("NFC").trim()
  if (!context) return null
  const url = safeSourceUrl(capture.sourceUrl)
  const locator = capture.source ?? { kind: url ? "web" : "image" }
  // Identity describes this passage, not a view or a review attempt. Saving it
  // again or importing the same archive cannot create a new encounter.
  const id = await sha256(JSON.stringify([cardId, normalizeAnswer(context), url, locator]))
  return vocabularySourceSchema.parse({
    id,
    cardId,
    context,
    translation: translation.slice(0, 1800),
    title: capture.sourceTitle,
    url,
    locator,
    createdAt: Date.now(),
  })
}

export function sourceLink(source: VocabularySource): string {
  const safe = safeSourceUrl(source.url)
  if (!safe) return ""
  const url = new URL(safe)
  if (source.locator.kind === "video" && source.locator.seconds !== undefined)
    url.searchParams.set("t", String(Math.floor(source.locator.seconds)))
  return url.href
}
