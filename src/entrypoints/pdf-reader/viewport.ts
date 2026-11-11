import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist"
import type { PdfReadingPosition } from "@/utils/selection-result/reading-position"
import { TextLayer } from "pdfjs-dist"
import { encodeCrop } from "../image-translate/image"
import { PdfParagraphLayer } from "./paragraph-layer"
export type ViewPosition = Pick<PdfReadingPosition, "page" | "offset" | "zoom">
interface Lease {
  cancel: () => void
  ready?: Promise<void>
}
export function pageAtOffset(tops: number[], offset: number) {
  let lo = 0,
    hi = tops.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    // Fractional device pixels can round scrollTop slightly below a requested page top.
    if (tops[mid]! <= offset + 0.5) lo = mid
    else hi = mid - 1
  }
  return lo
}
export class PdfViewport {
  get element() {
    return this.host
  }
  readonly paragraphs: PdfParagraphLayer
  private sizes: { width: number; height: number }[] = []
  private elements: HTMLDivElement[] = []
  private tops: number[] = []
  private leases = new Map<number, Lease>()
  private zoom: ViewPosition["zoom"] = "fit-width"
  private scale = 1
  private destroyed = false
  private suppressed = true
  private frame = 0
  private layoutVersion = 0
  private resize: ResizeObserver
  private width = 0
  constructor(
    private host: HTMLDivElement,
    private pdf: PDFDocumentProxy,
    private changed: (position: ViewPosition, activity: boolean) => void,
    private error: (text: string) => void,
  ) {
    this.paragraphs = new PdfParagraphLayer(
      host,
      () => this.snapshot(),
      (page, offset) => {
        const index = Math.max(0, Math.min(this.sizes.length - 1, page - 1))
        this.host.scrollTop = this.tops[index]! + offset * this.sizes[index]!.height * this.scale
        this.update(true)
      },
    )
    host.addEventListener("scroll", this.scrolled)
    this.resize = new ResizeObserver(() => {
      if (!this.elements.length || this.destroyed) return
      if (this.width === host.clientWidth) {
        this.update(false)
        return
      }
      this.layout(this.snapshot())
    })
    this.resize.observe(host)
  }
  async init(position?: ViewPosition) {
    // Dimensions only. Canvas and text are kept for at most three nearby pages.
    for (let start = 1; start <= this.pdf.numPages; start += 16) {
      const pages = await Promise.all(
        Array.from({ length: Math.min(16, this.pdf.numPages - start + 1) }, (_, n) =>
          this.pdf.getPage(start + n),
        ),
      )
      if (this.destroyed) return
      for (const page of pages) {
        const view = page.getViewport({ scale: 1 })
        this.sizes.push({ width: view.width, height: view.height })
        page.cleanup()
      }
    }
    const fragment = document.createDocumentFragment()
    for (let i = 0; i < this.sizes.length; i++) {
      const element = document.createElement("div")
      element.className = "rf-pdf-page"
      element.dataset.page = String(i + 1)
      element.setAttribute("aria-label", `Trang ${i + 1}`)
      this.elements.push(element)
      fragment.append(element)
    }
    this.host.replaceChildren(fragment)
    this.layout(position ?? { page: 1, offset: 0, zoom: "fit-width" })
  }
  snapshot(): ViewPosition {
    const index = pageAtOffset(this.tops, this.host.scrollTop)
    const height = (this.sizes[index]?.height ?? 1) * this.scale
    return {
      page: index + 1,
      offset: Math.max(0, Math.min(1, (this.host.scrollTop - (this.tops[index] ?? 0)) / height)),
      zoom: this.zoom,
    }
  }
  private layout(position: ViewPosition) {
    if (this.destroyed) return
    const version = ++this.layoutVersion
    this.suppressed = true
    this.width = this.host.clientWidth
    this.zoom = position.zoom
    this.scale =
      typeof this.zoom === "number"
        ? this.zoom
        : Math.max(
            0.1,
            Math.min(
              2,
              (this.width - 32) / this.sizes.reduce((max, s) => Math.max(max, s.width), 1),
            ),
          )
    for (const lease of this.leases.values()) lease.cancel()
    this.leases.clear()
    this.tops = []
    let top = 16
    this.elements.forEach((element, index) => {
      const size = this.sizes[index]!
      element.style.width = `${size.width * this.scale}px`
      element.style.height = `${size.height * this.scale}px`
      element.style.setProperty("--total-scale-factor", String(this.scale))
      this.tops.push(top)
      top += size.height * this.scale + 16
    })
    const index = Math.min(this.sizes.length - 1, Math.max(0, position.page - 1))
    this.host.scrollTop =
      this.tops[index]! + position.offset * this.sizes[index]!.height * this.scale
    this.update(false)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!this.destroyed && version === this.layoutVersion) this.suppressed = false
      }),
    )
  }
  navigate(page: number) {
    this.host.scrollTop = this.tops[Math.max(0, Math.min(this.sizes.length - 1, page - 1))] ?? 0
    this.update(true)
  }
  setZoom(zoom: ViewPosition["zoom"]) {
    this.layout({ ...this.snapshot(), zoom })
    this.changed(this.snapshot(), true)
  }
  reset() {
    this.layout({ page: 1, offset: 0, zoom: "fit-width" })
  }
  private scrolled = () => {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.update(!this.suppressed))
  }
  private update(activity: boolean) {
    if (this.destroyed || !this.sizes.length) return
    const position = this.snapshot(),
      index = position.page - 1
    // At smaller zoom, several pages can be visible. Give those pages priority
    // over an offscreen previous page within the three-canvas budget.
    const lastVisible = pageAtOffset(this.tops, this.host.scrollTop + this.host.clientHeight - 1)
    const needed = new Set<number>()
    for (let n = index; n <= Math.min(lastVisible, index + 2); n++) needed.add(n)
    for (const n of [index - 1, index + 1, index + 2])
      if (needed.size < 3 && n >= 0 && n < this.sizes.length) needed.add(n)
    for (const [n, lease] of this.leases)
      if (!needed.has(n)) {
        lease.cancel()
        this.leases.delete(n)
      }
    for (const n of needed) if (!this.leases.has(n)) this.render(n)
    this.changed(position, activity)
    this.paragraphs.update()
  }
  private render(index: number) {
    const element = this.elements[index]!,
      scale = this.scale
    let stopped = false,
      render: RenderTask | undefined,
      text: TextLayer | undefined,
      page: PDFPageProxy | undefined
    const lease: Lease = {
      cancel: () => {
        stopped = true
        render?.cancel()
        text?.cancel()
        element.replaceChildren()
        delete element.dataset.rendered
        page?.cleanup()
      },
    }
    this.leases.set(index, lease)
    lease.ready = (async () => {
      page = await this.pdf.getPage(index + 1)
      if (stopped) {
        page.cleanup()
        return
      }
      const viewport = page.getViewport({ scale })
      const density = Math.min(
        devicePixelRatio || 1,
        2,
        Math.sqrt(8_000_000 / (viewport.width * viewport.height)),
      )
      const canvas = document.createElement("canvas")
      canvas.width = Math.floor(viewport.width * density)
      canvas.height = Math.floor(viewport.height * density)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const layer = document.createElement("div")
      layer.className = "textLayer"
      layer.style.setProperty("--total-scale-factor", String(viewport.scale * viewport.userUnit))
      element.replaceChildren(canvas, layer)
      render = page.render({
        canvas,
        viewport,
        transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0],
      })
      text = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: layer,
        viewport,
      })
      const results = await Promise.allSettled([render.promise, text.render()])
      if (results.some((result) => result.status === "rejected"))
        throw new Error("PDF render cancelled or failed")
      if (!stopped) {
        element.dataset.rendered = "true"
        this.host.dispatchEvent(new Event("rf-pdf-render"))
      }
    })()
      .catch(() => {
        if (!stopped && !this.destroyed)
          this.error(`Không render được trang ${index + 1}. Thử chuyển trang hoặc mở lại file.`)
      })
      .finally(() => {
        if (stopped) page?.cleanup()
      })
  }
  async captureVisible() {
    this.update(false)
    await Promise.all([...this.leases.values()].map((lease) => lease.ready ?? Promise.resolve()))
    if (this.destroyed) throw new Error("PDF đã đóng. Hãy mở lại file.")
    const hostBox = this.host.getBoundingClientRect()
    const width = this.host.clientWidth,
      height = this.host.clientHeight
    const output = document.createElement("canvas")
    const scale = Math.min(1.5, Math.sqrt(8_000_000 / (width * height)))
    output.width = Math.round(width * scale)
    output.height = Math.round(height * scale)
    const context = output.getContext("2d")!
    context.scale(scale, scale)
    context.fillStyle = "#404247"
    context.fillRect(0, 0, width, height)
    let found = false
    for (const page of this.elements) {
      const box = page.getBoundingClientRect()
      if (
        box.bottom <= hostBox.top ||
        box.top >= hostBox.bottom ||
        box.right <= hostBox.left ||
        box.left >= hostBox.right
      )
        continue
      const source = page.querySelector("canvas")
      if (!source || page.dataset.rendered !== "true")
        throw new Error(
          "Trang đang render hoặc thu phóng quá nhỏ. Chờ trang hiện rõ hoặc tăng thu phóng rồi chụp lại.",
        )
      context.drawImage(
        source,
        box.left - hostBox.left,
        box.top - hostBox.top,
        box.width,
        box.height,
      )
      found = true
    }
    if (!found) throw new Error("Chưa có trang PDF để chụp.")
    return encodeCrop(output, output.width, output.height, { x: 0, y: 0, width: 1, height: 1 })
  }
  destroy() {
    this.paragraphs.destroy()
    this.destroyed = true
    cancelAnimationFrame(this.frame)
    this.resize.disconnect()
    this.host.removeEventListener("scroll", this.scrolled)
    for (const lease of this.leases.values()) lease.cancel()
    this.leases.clear()
    this.host.replaceChildren()
  }
}
