import { pdfHistoryDB } from "./pdf-history"
import {
  pdfDocumentIdSchema,
  pdfReadingPositionSchema,
  type PdfReadingPosition,
} from "./reading-position"

export async function getPdfReadingPosition(documentId: string) {
  pdfDocumentIdSchema.parse(documentId)
  return pdfHistoryDB.transaction(
    "r",
    [pdfHistoryDB.positions, pdfHistoryDB.positionEpochs],
    async () => {
      const value = await pdfHistoryDB.positions.get(documentId)
      return {
        position: value ? pdfReadingPositionSchema.parse(value) : null,
        epoch: (await pdfHistoryDB.positionEpochs.get(documentId))?.epoch ?? 0,
      }
    },
  )
}
export async function savePdfReadingPosition(position: PdfReadingPosition, epoch: number) {
  const value = pdfReadingPositionSchema.parse(position)
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new Error("Invalid position epoch")
  return pdfHistoryDB.transaction(
    "rw",
    [pdfHistoryDB.positions, pdfHistoryDB.positionEpochs],
    async () => {
      if (((await pdfHistoryDB.positionEpochs.get(value.documentId))?.epoch ?? 0) !== epoch)
        return "cleared" as const
      const previous = await pdfHistoryDB.positions.get(value.documentId)
      if (previous && previous.updatedAt >= value.updatedAt) return "stale" as const
      await pdfHistoryDB.positions.put(value)
      return "saved" as const
    },
  )
}
export async function forgetPdfReadingPosition(documentId: string) {
  pdfDocumentIdSchema.parse(documentId)
  return pdfHistoryDB.transaction(
    "rw",
    [pdfHistoryDB.positions, pdfHistoryDB.positionEpochs],
    async () => {
      const epoch = ((await pdfHistoryDB.positionEpochs.get(documentId))?.epoch ?? 0) + 1
      await pdfHistoryDB.positionEpochs.put({ documentId, epoch })
      await pdfHistoryDB.positions.delete(documentId)
      return epoch
    },
  )
}
