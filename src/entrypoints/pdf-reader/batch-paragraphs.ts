import type { PDFDocumentProxy } from "pdfjs-dist"
import type { PdfViewport } from "./viewport"
import { TextLayer } from "pdfjs-dist"
import { paragraphSource } from "./paragraph-edits"
import { extractPdfParagraphs, MAX_PDF_TEXT_BOXES, type PdfTextBox } from "./paragraphs"
import { loadStudy } from "./study-data"
/** One temporary text layer, no reading canvas or full-document DOM. */
export async function extractBatchParagraphs(
  pdf: PDFDocumentProxy,
  owner: PdfViewport,
  number: number,
  signal: AbortSignal,
) {
  signal.throwIfAborted()
  const page = await pdf.getPage(number),
    view = page.getViewport({ scale: 1 })
  const legacy = await loadStudy(owner.workspace.getSnapshot().data.id)
  const ocr = legacy.ocr.find((p) => p.page === number) ?? (await owner.ocrCache.get(number))
  signal.throwIfAborted()
  let items: PdfTextBox[] = []
  if (ocr)
    items = ocr.words.map((w) => ({
      ...w,
      x: w.x * view.width,
      y: w.y * view.height,
      width: w.width * view.width,
      height: w.height * view.height,
    }))
  else {
    const content = await page.getTextContent()
    signal.throwIfAborted()
    const root = document.createElement("div"),
      host = document.createElement("div")
    root.className = "rf-batch-measure rf-pdf-page"
    host.className = "textLayer"
    Object.assign(root.style, {
      position: "fixed",
      left: "-20000px",
      top: "0",
      width: `${view.width}px`,
      height: `${view.height}px`,
      visibility: "hidden",
      pointerEvents: "none",
    })
    root.style.setProperty("--total-scale-factor", "1")
    root.append(host)
    document.body.append(root)
    const layer = new TextLayer({ textContentSource: content, container: host, viewport: view })
    const cancel = () => layer.cancel()
    signal.addEventListener("abort", cancel, { once: true })
    try {
      // Load embedded fonts without painting another reading canvas.
      await page.getOperatorList()
      await document.fonts.ready
      signal.throwIfAborted()
      await layer.render()
      signal.throwIfAborted()
      const spans = [...host.querySelectorAll<HTMLElement>("span")].filter(
        (s) => !s.childElementCount && s.textContent?.trim(),
      )
      if (spans.length > MAX_PDF_TEXT_BOXES)
        throw new Error(`Trang ${number} quá nhiều chữ để chia đoạn.`)
      const origin = root.getBoundingClientRect()
      items = spans.map((span) => {
        const r = span.getBoundingClientRect()
        return {
          text: span.textContent ?? "",
          x: r.left - origin.left,
          y: r.top - origin.top,
          width: r.width,
          height: r.height,
          dir: span.dir,
        }
      })
    } finally {
      signal.removeEventListener("abort", cancel)
      layer.cancel()
      root.remove()
      if (!owner.element.querySelector(`.rf-pdf-page[data-page="${number}"][data-rendered=true]`))
        page.cleanup()
    }
  }
  signal.throwIfAborted()
  const auto = extractPdfParagraphs(items, view.width, view.height, number),
    source = paragraphSource(auto.paragraphs)
  const saved = owner.workspace.getSnapshot().data.layouts.find((p) => p.page === number)
  if (saved && saved.source !== source)
    throw new Error(
      `Trang ${number} có phần nhận diện đã chỉnh. Mở trang để kiểm tra trước khi dịch dải.`,
    )
  return { ...auto, source, paragraphs: saved?.paragraphs ?? auto.paragraphs }
}
