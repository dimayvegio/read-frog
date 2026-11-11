import { languageTagSchema } from "@read-frog/definitions"
import { z } from "zod"

export type SourceViewFailure = "UI-LOAD-TIMEOUT" | "UI-LOAD-FAILED" | "UI-SOURCE-CHANGED"
export type SourceViewResult = { ok: true } | { ok: false; reason: SourceViewFailure }

export const liveRowSchema = z.strictObject({
  id: z.number().int().nonnegative(),
  source: z.string().max(4000),
  translation: z.string().max(6000),
  state: z.enum(["waiting", "working", "done"]),
})
export type LiveRow = z.infer<typeof liveRowSchema>
export const liveTranslationSchema = z.strictObject({
  enabled: z.boolean(),
  target: languageTagSchema,
  rows: z.array(liveRowSchema).max(24),
  message: z.string().max(300),
  failed: z.boolean(),
})
export type LiveTranslation = z.infer<typeof liveTranslationSchema>
export const liveTranslationCommand = z.strictObject({
  session: z.string().uuid(),
  enabled: z.boolean(),
  target: languageTagSchema,
  retry: z.boolean().optional(),
})
export type LiveTranslationCommand = z.infer<typeof liveTranslationCommand>

export function liveTranscriptSourceURL(url: string | undefined): string | null {
  try {
    const value = new URL(url ?? "")
    return ["http:", "https:", "file:"].includes(value.protocol) &&
      !value.username &&
      !value.password
      ? value.href
      : null
  } catch {
    return null
  }
}
export const sourceViewSchema = z.strictObject({
  session: z.string().uuid(),
  status: z.enum(["connecting", "listening", "stopping", "stopped"]),
  text: z.string().max(16000),
  pending: z.string().max(4000),
  message: z.string().max(2000),
  translation: liveTranslationSchema,
})
export type SourceView = z.infer<typeof sourceViewSchema>
export const sourceSnapshotSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  view: sourceViewSchema.nullable(),
})
export type SourceSnapshot = z.infer<typeof sourceSnapshotSchema>
export const sourceActionSchema = z.strictObject({
  session: z.string().uuid(),
  action: z.enum(["stop", "audio", "video"]),
})
export type SourceAction = z.infer<typeof sourceActionSchema>
