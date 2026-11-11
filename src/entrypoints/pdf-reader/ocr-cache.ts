import type { OcrPage } from "./study-data"
import { validateStudy } from "./study-data"
import { pdfWorkspaceDB } from "./workspace"
export type PdfOcrEpoch = { docId: string; epoch: number }
export type StoredPdfOcr = {
  docId: string
  page: number
  revision: number
  epoch: number
  value: OcrPage
}
export class PdfOcrCache {
  private cache = new Map<number, OcrPage | undefined>()
  private pending = new Map<number, Promise<OcrPage | undefined>>()
  private known?: Set<number>
  private knownJob?: Promise<Set<number>>
  private generation = 0
  private closed = false
  constructor(private id: string) {}
  async context(page: number) {
    const [epoch, row] = await Promise.all([
      pdfWorkspaceDB.ocrEpochs.get(this.id),
      pdfWorkspaceDB.ocrPages.get([this.id, page]),
    ])
    return { epoch: epoch?.epoch ?? 0, revision: row?.revision ?? 0 }
  }
  private pages() {
    if (this.known) return Promise.resolve(this.known)
    if (this.knownJob) return this.knownJob
    const generation = this.generation
    const job = pdfWorkspaceDB.ocrPages
      .where("docId")
      .equals(this.id)
      .primaryKeys()
      .then((keys) => {
        const pages = new Set(keys.map((key) => key[1]))
        if (!this.closed && generation === this.generation) this.known = pages
        return pages
      })
      .finally(() => {
        if (this.knownJob === job) this.knownJob = undefined
      })
    this.knownJob = job
    return job
  }
  get(page: number): Promise<OcrPage | undefined> {
    if (this.closed) return Promise.resolve(undefined)
    if (this.cache.has(page)) {
      const value = this.cache.get(page)
      this.cache.delete(page)
      this.cache.set(page, value)
      return Promise.resolve(value)
    }
    const running = this.pending.get(page)
    if (running) return running
    const generation = this.generation
    const job = this.pages()
      .then(async (pages) => {
        if (this.closed || generation !== this.generation || !pages.has(page)) return undefined
        return pdfWorkspaceDB.ocrPages.get([this.id, page])
      })
      .then((row) => {
        const value = row?.value
        if (value && value.page !== page) throw new Error("Trang OCR không khớp chỉ mục.")
        if (value) validateStudy({ id: this.id, revision: 0, annotations: [], ocr: [value] })
        if (!this.closed && generation === this.generation) {
          this.cache.set(page, value)
          while (this.cache.size > 6) this.cache.delete(this.cache.keys().next().value!)
        }
        return this.closed || generation !== this.generation ? undefined : value
      })
      .finally(() => {
        if (this.pending.get(page) === job) this.pending.delete(page)
      })
    this.pending.set(page, job)
    return job
  }
  async save(value: OcrPage, before: { epoch: number; revision: number }, current: () => boolean) {
    validateStudy({ id: this.id, revision: 0, annotations: [], ocr: [value] })
    if (JSON.stringify(value).length > 2_000_000) throw new Error("Trang OCR quá nhiều chữ để lưu.")
    const check = () => {
      if (this.closed || !current()) throw new Error("Đã dừng OCR; không lưu trang muộn.")
    }
    check()
    await pdfWorkspaceDB.transaction(
      "rw",
      pdfWorkspaceDB.ocrPages,
      pdfWorkspaceDB.ocrEpochs,
      async () => {
        const context = await this.context(value.page)
        if (context.epoch !== before.epoch || context.revision !== before.revision)
          throw new Error("OCR đã đổi hoặc bị xóa ở cửa sổ khác. Hãy thử lại.")
        if (
          before.revision === 0 &&
          ((await pdfWorkspaceDB.ocrPages.where("docId").equals(this.id).count()) >= 500 ||
            (await pdfWorkspaceDB.ocrPages.count()) >= 3000)
        )
          throw new Error(
            "Đã đạt giới hạn cache OCR (500 trang/file, 3.000 trang trên máy). Xóa OCR cũ trước khi thêm.",
          )
        check()
        await pdfWorkspaceDB.ocrPages.put({
          docId: this.id,
          page: value.page,
          revision: before.revision + 1,
          epoch: before.epoch,
          value,
        })
        check()
      },
    )
    this.known?.add(value.page)
    this.cache.delete(value.page)
    await this.get(value.page)
  }
  count() {
    return pdfWorkspaceDB.ocrPages.where("docId").equals(this.id).count()
  }
  async clear() {
    await pdfWorkspaceDB.transaction(
      "rw",
      pdfWorkspaceDB.ocrPages,
      pdfWorkspaceDB.ocrEpochs,
      async () => {
        const epoch = (await pdfWorkspaceDB.ocrEpochs.get(this.id))?.epoch ?? 0
        await pdfWorkspaceDB.ocrEpochs.put({ docId: this.id, epoch: epoch + 1 })
        await pdfWorkspaceDB.ocrPages.where("docId").equals(this.id).delete()
      },
    )
    this.invalidate()
  }
  invalidate() {
    ++this.generation
    this.known = undefined
    this.knownJob = undefined
    this.cache.clear()
    this.pending.clear()
  }
  destroy() {
    this.closed = true
    this.invalidate()
  }
}
