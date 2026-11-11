import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist"
import type { PdfReadingPosition } from "@/utils/selection-result/reading-position"
import { TextLayer } from "pdfjs-dist"
import { encodeCrop } from "../image-translate/image"
import { PdfParagraphLayer } from "./paragraph-layer"
import { PdfWorkspace } from "./workspace"
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
  readonly workspace: PdfWorkspace
  private sizes: { width: number; height: number }[] = []
  private elements: HTMLDivElement[] = []
  private tops: number[] = []
  private measured = new Set<number>()
  private leases = new Map<number, Lease>()
  private zoom: ViewPosition["zoom"] = "fit-width"
  private destroyed = false
  private suppressed = true
  private frame = 0
  private geometryFrame = 0
  private resumeFrame = 0
  private navigation = 0
  private layoutVersion = 0
  private resize: ResizeObserver
  private width = 0
  constructor(
    private host: HTMLDivElement,
    private pdf: PDFDocumentProxy,
    private changed: (position: ViewPosition, activity: boolean) => void,
    private error: (text: string) => void,
    documentId: string,
  ) {
    this.workspace = new PdfWorkspace(documentId)
    this.paragraphs = new PdfParagraphLayer(
      host,
      () => this.snapshot(),
      (page, offset) => {
        const index = Math.max(0, Math.min(this.sizes.length - 1, page - 1))
        this.host.scrollTop =
          this.tops[index]! + offset * this.sizes[index]!.height * this.pageScale(index)
        this.update(true)
      },
      this.workspace,
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
    // Measure the requested page first. Other placeholders borrow its dimensions
    // until actually needed; opening a long PDF must not parse every page first.
    const index = Math.max(0, Math.min(this.pdf.numPages - 1, (position?.page ?? 1) - 1))
    const page = await this.pdf.getPage(index + 1)
    if (this.destroyed) return
    const base = page.getViewport({ scale: 1 })
    this.sizes = Array.from({ length: this.pdf.numPages }, () => ({
      width: base.width,
      height: base.height,
    }))
    this.measured.add(index)
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
    const height = (this.sizes[index]?.height ?? 1) * this.pageScale(index)
    return {
      page: index + 1,
      offset: Math.max(0, Math.min(1, (this.host.scrollTop - (this.tops[index] ?? 0)) / height)),
      zoom: this.zoom,
    }
  }
  private pageScale(index: number) {
    return typeof this.zoom === "number"
      ? this.zoom
      : Math.max(0.1, Math.min(2, (this.width - 32) / (this.sizes[index]?.width ?? 1)))
  }
  private suppressScroll() {
    const version = ++this.layoutVersion
    this.suppressed = true
    cancelAnimationFrame(this.resumeFrame)
    this.resumeFrame = requestAnimationFrame(() => {
      this.resumeFrame = requestAnimationFrame(() => {
        this.resumeFrame = 0
        if (!this.destroyed && version === this.layoutVersion) this.suppressed = false
      })
    })
  }
  private measure(index: number, page: PDFPageProxy) {
    if (this.measured.has(index)) return
    const base = page.getViewport({ scale: 1 }),
      previous = this.sizes[index]!
    this.measured.add(index)
    if (base.width === previous.width && base.height === previous.height) return
    const anchor = this.snapshot(),
      oldHeight = previous.height * this.pageScale(index)
    this.sizes[index] = { width: base.width, height: base.height }
    const scale = this.pageScale(index),
      height = base.height * scale
    const element = this.elements[index]!
    element.style.width = `${base.width * scale}px`
    element.style.height = `${height}px`
    element.style.setProperty("--total-scale-factor", String(scale))
    const delta = height - oldHeight
    for (let n = index + 1; n < this.tops.length; n++) this.tops[n]! += delta
    // Preserve the same page/fraction while estimated pages above it are corrected.
    this.suppressScroll()
    this.host.scrollTop =
      this.tops[anchor.page - 1]! +
      anchor.offset * this.sizes[anchor.page - 1]!.height * this.pageScale(anchor.page - 1)
    if (!this.geometryFrame)
      this.geometryFrame = requestAnimationFrame(() => {
        this.geometryFrame = 0
        this.update(false)
      })
  }
  private layout(position: ViewPosition) {
    if (this.destroyed) return
    this.suppressScroll()
    this.width = this.host.clientWidth
    this.zoom = position.zoom
    for (const lease of this.leases.values()) lease.cancel()
    this.leases.clear()
    this.tops = []
    let top = 16
    this.elements.forEach((element, index) => {
      const size = this.sizes[index]!
      const scale = this.pageScale(index)
      element.style.width = `${size.width * scale}px`
      element.style.height = `${size.height * scale}px`
      element.style.setProperty("--total-scale-factor", String(scale))
      this.tops.push(top)
      top += size.height * scale + 16
    })
    const index = Math.min(this.sizes.length - 1, Math.max(0, position.page - 1))
    this.host.scrollTop =
      this.tops[index]! + position.offset * this.sizes[index]!.height * this.pageScale(index)
    this.update(false)
  }
  navigate(page: number, offset = 0, zoom = this.zoom) {
    const index = Math.max(0, Math.min(this.sizes.length - 1, page - 1)),
      token = ++this.navigation
    const jump = () => {
      if (this.zoom !== zoom) this.layout({ page: index + 1, offset, zoom })
      this.host.scrollTop =
        (this.tops[index] ?? 0) +
        Math.max(0, Math.min(1, offset)) * this.sizes[index]!.height * this.pageScale(index)
      this.update(true)
    }
    if (this.measured.has(index)) jump()
    else
      void this.pdf
        .getPage(index + 1)
        .then((value) => {
          if (this.destroyed || token !== this.navigation) return
          this.measure(index, value)
          jump()
        })
        .catch(() => {
          if (!this.destroyed && token === this.navigation)
            this.error(`Không đọc được trang ${index + 1}.`)
        })
  }
  setZoom(zoom: ViewPosition["zoom"]) {
    ++this.navigation
    this.layout({ ...this.snapshot(), zoom })
    this.changed(this.snapshot(), true)
  }
  reset() {
    ++this.navigation
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
    const element = this.elements[index]!
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
      this.measure(index, page)
      const viewport = page.getViewport({ scale: this.pageScale(index) })
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
    this.workspace.destroy()
    this.paragraphs.destroy()
    this.destroyed = true
    cancelAnimationFrame(this.frame)
    cancelAnimationFrame(this.geometryFrame)
    cancelAnimationFrame(this.resumeFrame)
    ++this.navigation
    this.resize.disconnect()
    this.host.removeEventListener("scroll", this.scrolled)
    for (const lease of this.leases.values()) lease.cancel()
    this.leases.clear()
    this.host.replaceChildren()
  }
}
