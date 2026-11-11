import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist"
import type { Worker } from "tesseract.js"
import type { OcrPage } from "./study-data"
import { browser } from "#imports"
import { validBox } from "./study-data"

// Bound worker initialization too: cancellation during WASM startup must not
// permit a burst of pending workers from repeated clicks.
let creatingWorker = false
export class LocalPdfOcr {
  private worker?: Worker
  private render?: RenderTask
  private stopped = false
  private busy = false
  private language?: string
  private document?: PDFDocumentProxy
  private progress?: (text: string) => void
  private reject?: (error: Error) => void
  cancel() {
    this.stopped = true
    this.progress = undefined
    this.render?.cancel()
    void this.worker?.terminate()
    this.worker = undefined
    this.reject?.(new Error("Đã dừng OCR."))
  }
  async read(
    pdf: PDFDocumentProxy,
    pageNumber: number,
    language: string,
    progress: (text: string) => void,
  ): Promise<OcrPage> {
    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > pdf.numPages ||
      !["eng", "vie", "chi_sim", "jpn"].includes(language)
    )
      throw new Error("Trang hoặc ngôn ngữ OCR không hợp lệ.")
    if (
      this.stopped ||
      this.busy ||
      (this.document && (this.document !== pdf || this.language !== language))
    )
      throw new Error("Phiên OCR đã dừng hoặc đang xử lý trang khác.")
    this.busy = true
    this.document = pdf
    this.language = language
    this.progress = progress
    let timer: ReturnType<typeof setTimeout> | undefined
    const work = async (): Promise<OcrPage> => {
      if (!this.worker) {
        const { createWorker, OEM } = await import("tesseract.js")
        if (this.stopped) throw new Error("Đã dừng OCR.")
        const assets = new URL("ocr-assets/", browser.runtime.getURL("/")).href
        if (creatingWorker) throw new Error("OCR trước đang dừng. Chờ một chút rồi thử lại.")
        creatingWorker = true
        let worker: Worker
        try {
          worker = await createWorker(language, OEM.LSTM_ONLY, {
            workerPath: assets + "worker.min.js",
            corePath: assets,
            langPath: assets.slice(0, -1),
            workerBlobURL: false,
            cacheMethod: "none",
            gzip: true,
            logger: (event) => {
              if (!this.stopped)
                this.progress?.(`${event.status} · ${Math.round(event.progress * 100)}%`)
            },
            errorHandler: () => this.cancel(),
          })
        } finally {
          creatingWorker = false
        }
        if (this.stopped) {
          await worker.terminate()
          throw new Error("Đã dừng OCR.")
        }
        this.worker = worker
      }
      const worker = this.worker
      const page = await pdf.getPage(pageNumber)
      if (this.stopped) throw new Error("Đã dừng OCR.")
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(2.5, Math.sqrt(6_000_000 / (base.width * base.height)))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement("canvas")
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      try {
        this.render = page.render({ canvas, viewport })
        await this.render.promise
        if (this.stopped) throw new Error("Đã dừng OCR.")
        const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true })
        if (this.stopped) throw new Error("Đã dừng OCR.")
        const words: OcrPage["words"] = []
        for (const block of data.blocks ?? [])
          for (const paragraph of block.paragraphs)
            for (const line of paragraph.lines)
              for (const word of line.words) {
                const { x0, y0, x1, y1 } = word.bbox
                const box = {
                  x: x0 / canvas.width,
                  y: y0 / canvas.height,
                  width: (x1 - x0) / canvas.width,
                  height: (y1 - y0) / canvas.height,
                }
                const text = word.text.normalize("NFC").trim()
                if (text && validBox(box)) words.push({ ...box, text })
                if (words.length > 6000)
                  throw new Error("Trang quá nhiều chữ. Hãy dùng Chụp vùng & dịch ảnh.")
              }
        return { page: pageNumber, language, engine: "tesseract7-int-v1", words }
      } finally {
        canvas.width = canvas.height = 0
        this.render = undefined
      }
    }
    try {
      return await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          this.reject = reject
          timer = setTimeout(() => this.cancel(), 120000)
        }),
      ])
    } catch (error) {
      this.cancel()
      throw error
    } finally {
      clearTimeout(timer)
      this.reject = undefined
      this.progress = undefined
      this.busy = false
    }
  }
}
