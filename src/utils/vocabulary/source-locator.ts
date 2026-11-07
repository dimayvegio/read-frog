import { z } from "zod"
// Kept apart from card/source helpers so the portable schemas have no cycle.
export const sourceLocatorSchema = z.strictObject({
  kind: z.enum(["web", "pdf", "video", "image"]),
  documentId: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  page: z.number().int().min(1).max(20000).optional(),
  seconds: z.number().min(0).max(864000).optional(),
})
export type SourceLocator = z.infer<typeof sourceLocatorSchema>
