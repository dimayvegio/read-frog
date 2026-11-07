import { z } from "zod"
export const MAX_PDF_PAGE = 1_000_000
export const pdfPageSchema = z.number().int().min(1).max(MAX_PDF_PAGE)
export const pdfDocumentIdSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const pdfReadingPositionSchema = z
  .strictObject({
    documentId: pdfDocumentIdSchema,
    historyDocumentId: pdfDocumentIdSchema,
    title: z.string().min(1).max(240),
    pageCount: pdfPageSchema,
    page: pdfPageSchema,
    offset: z.number().min(0).max(1),
    zoom: z.union([z.literal("fit-width"), z.number().min(0.25).max(4)]),
    updatedAt: z.number().int().nonnegative(),
  })
  .refine((value) => value.page <= value.pageCount, "Page exceeds document length")
export type PdfReadingPosition = z.infer<typeof pdfReadingPositionSchema>
export interface PdfPositionState {
  position: PdfReadingPosition | null
  epoch: number
}
export interface PdfReaderSource {
  url: string
  document: { id: string; title: string }
}
