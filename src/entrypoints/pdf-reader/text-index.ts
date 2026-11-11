import type { PDFDocumentProxy } from "pdfjs-dist"
import type { OcrPage } from "./study-data"
import { joinPdfRuns, normalizePdfSearch } from "./study-data"

type Entry = { source: string; folded: string; ocrId: number }
// A document-owned LRU, not a second persistent search database. Budget counts
// both strings in UTF-16 units (at most 16 MiB of text payload, plus small metadata).
export class PdfTextIndex {
  private entries = new Map<number, Entry>()
  private pending = new Map<number, { ocrId: number; job: Promise<Entry> }>()
  private ocrIds = new WeakMap<OcrPage, number>()
  private nextOcrId = 0
  private units = 0
  private closed = false
  constructor(
    private pdf: PDFDocumentProxy,
    private budget = 8 * 1024 * 1024,
    private maxPages = 2048,
  ) {}
  async get(page: number, ocr?: OcrPage): Promise<Entry> {
    if (this.closed) throw new Error("PDF đã đóng.")
    if (!ocr?.words.length) ocr = undefined
    // Do not retain an obsolete OCR word/geometry tree after an edit or clear.
    let ocrId = ocr ? this.ocrIds.get(ocr) : 0
    if (ocr && ocrId === undefined) this.ocrIds.set(ocr, (ocrId = ++this.nextOcrId))
    const cached = this.entries.get(page)
    if (cached && cached.ocrId === ocrId) {
      this.entries.delete(page)
      this.entries.set(page, cached)
      return cached
    }
    const pending = this.pending.get(page)
    if (pending && pending.ocrId === ocrId) return pending.job
    const job = (async () => {
      const text = ocr
        ? joinPdfRuns(ocr.words.map((word) => word.text))
        : joinPdfRuns(
            (await (await this.pdf.getPage(page)).getTextContent()).items.map((item) =>
              "str" in item ? item.str : "",
            ),
          )
      const source = text.normalize("NFC").replace(/\s+/gu, " ")
      return { source, folded: normalizePdfSearch(source), ocrId: ocrId! }
    })()
    const owner = { ocrId: ocrId!, job }
    this.pending.set(page, owner)
    try {
      const value = await job
      if (!this.closed && this.pending.get(page) === owner) {
        this.drop(page)
        const units = value.source.length + value.folded.length
        if (units <= Math.min(200_000, this.budget)) {
          this.entries.set(page, value)
          this.units += units
          while (this.units > this.budget || this.entries.size > this.maxPages)
            this.drop(this.entries.keys().next().value!)
        }
      }
      return value
    } finally {
      if (this.pending.get(page) === owner) this.pending.delete(page)
    }
  }
  private drop(page: number) {
    const entry = this.entries.get(page)
    if (entry) this.units -= entry.source.length + entry.folded.length
    this.entries.delete(page)
  }
  destroy() {
    this.closed = true
    this.entries.clear()
    this.pending.clear()
    this.units = 0
  }
}
