import type { PdfReadingPosition } from "./reading-position"
import { Dexie, type Table } from "dexie"
import { sha256 } from "js-sha256"
import { z } from "zod"

const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const pdfDocumentSchema = z.strictObject({ id: hash, title: z.string().min(1).max(240) })
export type PdfDocument = z.infer<typeof pdfDocumentSchema>
const recordSchema = z.strictObject({
  id: hash,
  documentId: hash,
  original: z.string().max(20000),
  prepared: z.string().max(20000),
  output: z.string().min(1).max(60000),
  targetLanguage: z.string().max(24),
  model: z.string().max(160),
  clean: z.boolean(),
  joinHyphenatedWords: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type PdfHistoryRecord = z.infer<typeof recordSchema>
interface StoredDocument extends PdfDocument {
  epoch: number
  updatedAt: number
}
interface HistoryBudget {
  key: "budget"
  count: number
  bytes: number
}
export const PDF_HISTORY_MAX_RECORDS = 1000
export const PDF_HISTORY_MAX_BYTES = 32 * 1024 * 1024
export class PdfHistoryDatabase extends Dexie {
  documents!: Table<StoredDocument, string>
  translations!: Table<PdfHistoryRecord, string>
  meta!: Table<HistoryBudget, string>
  positions!: Table<PdfReadingPosition, string>
  positionEpochs!: Table<{ documentId: string; epoch: number }, string>
  constructor(name = "read-frog-pdf-reading") {
    super(name)
    this.version(1).stores({
      documents: "&id, updatedAt",
      translations: "&id, documentId, updatedAt",
      meta: "&key",
    })
    // Additive only; published v1 data/epoch/budget stay unchanged.
    this.version(2).stores({ positions: "&documentId, updatedAt", positionEpochs: "&documentId" })
  }
}
export const pdfHistoryDB = new PdfHistoryDatabase()
export const pdfCacheKey = (documentId: string, identity: unknown) =>
  sha256(JSON.stringify(["pdf-reading-v1", documentId, identity]))
export async function getPdfHistoryEpoch(document: PdfDocument) {
  return (await pdfHistoryDB.documents.get(document.id))?.epoch ?? 0
}
export async function readPdfCache(id: string, documentId: string) {
  const value = await pdfHistoryDB.translations.get(id)
  return value?.documentId === documentId ? recordSchema.parse(value) : null
}
const recordBytes = (record: PdfHistoryRecord) =>
  new TextEncoder().encode(JSON.stringify(record)).length
async function resetBudget() {
  const rows = await pdfHistoryDB.translations.toArray()
  const budget: HistoryBudget = {
    key: "budget",
    count: rows.length,
    bytes: rows.reduce((sum, row) => sum + recordBytes(row), 0),
  }
  await pdfHistoryDB.meta.put(budget)
  return budget
}
export async function savePdfHistory(
  document: PdfDocument,
  record: PdfHistoryRecord,
  epoch: number,
  signal: AbortSignal,
) {
  document = pdfDocumentSchema.parse(document)
  record = recordSchema.parse(record)
  if (record.documentId !== document.id) throw new Error("Tài liệu không khớp lịch sử.")
  return pdfHistoryDB.transaction("rw", pdfHistoryDB.tables, async () => {
    signal.throwIfAborted()
    const previous = await pdfHistoryDB.documents.get(document.id)
    if ((previous?.epoch ?? 0) !== epoch) return false // Clear wins over a late stream.
    const old = await pdfHistoryDB.translations.get(record.id)
    const budget = (await pdfHistoryDB.meta.get("budget")) ?? (await resetBudget())
    const value = { ...record, createdAt: old?.createdAt ?? record.createdAt }
    const count = budget.count + (old ? 0 : 1),
      size = budget.bytes + recordBytes(value) - (old ? recordBytes(old) : 0)
    if (count > PDF_HISTORY_MAX_RECORDS || size > PDF_HISTORY_MAX_BYTES)
      throw new Error(
        "Lịch sử PDF đã đầy (1.000 đoạn / 32 MiB). Hãy xuất rồi xóa lịch sử tài liệu không cần giữ.",
      )
    await pdfHistoryDB.documents.put({ ...document, epoch, updatedAt: Date.now() })
    signal.throwIfAborted()
    await pdfHistoryDB.translations.put(value)
    await pdfHistoryDB.meta.put({ key: "budget", count, bytes: size })
    signal.throwIfAborted()
    return true
  })
}
export async function listPdfHistory(documentId: string) {
  return (await pdfHistoryDB.translations.where("documentId").equals(documentId).toArray()).sort(
    (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
  )
}
export async function clearPdfHistory(document: PdfDocument) {
  await pdfHistoryDB.transaction("rw", pdfHistoryDB.tables, async () => {
    const old = await pdfHistoryDB.documents.get(document.id)
    await pdfHistoryDB.translations.where("documentId").equals(document.id).delete()
    await resetBudget()
    await pdfHistoryDB.documents.put({
      ...pdfDocumentSchema.parse(document),
      epoch: (old?.epoch ?? 0) + 1,
      updatedAt: Date.now(),
    })
  })
}
