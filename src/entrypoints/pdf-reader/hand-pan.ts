/** View-only pan: no annotation, OCR or provider paths. */
export class PdfHandPan {
  private gesture?: {
    pointer: number
    x: number
    y: number
    left: number
    top: number
    dx: number
    dy: number
  }
  private frame = 0
  constructor(
    private host: HTMLElement,
    private changed: () => void,
  ) {
    host.addEventListener("pointerdown", this.down)
    host.addEventListener("pointermove", this.move)
    host.addEventListener("pointerup", this.up)
    host.addEventListener("pointercancel", this.lost)
    host.addEventListener("lostpointercapture", this.lost)
    host.addEventListener("rf-pdf-view-change", this.cancel)
    window.addEventListener("blur", this.cancel)
    window.addEventListener("resize", this.cancel)
  }
  private down = (event: PointerEvent) => {
    if (
      this.gesture ||
      !event.isPrimary ||
      event.button !== 0 ||
      this.host.dataset.studyTool !== "hand" ||
      !(event.target as Element).closest(".rf-pdf-page[data-rendered=true]") ||
      (event.target as Element).closest("button")
    )
      return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.gesture = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: this.host.scrollLeft,
      top: this.host.scrollTop,
      dx: 0,
      dy: 0,
    }
    this.host.dataset.pdfPanning = "true"
    this.host.setPointerCapture(event.pointerId)
  }
  private paint = () => {
    this.frame = 0
    const g = this.gesture
    if (g) {
      this.host.scrollLeft = g.left - g.dx
      this.host.scrollTop = g.top - g.dy
    }
  }
  private move = (event: PointerEvent) => {
    const g = this.gesture
    if (!g || event.pointerId !== g.pointer) return
    if (this.host.dataset.studyTool !== "hand") {
      this.cancel()
      return
    }
    event.preventDefault()
    g.dx = event.clientX - g.x
    g.dy = event.clientY - g.y
    if (!this.frame) this.frame = requestAnimationFrame(this.paint)
  }
  private up = (event: PointerEvent) => {
    if (this.gesture?.pointer !== event.pointerId) return
    this.move(event)
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.paint()
    this.cancel()
    this.changed()
  }
  private lost = (event: PointerEvent) => {
    if (this.gesture?.pointer === event.pointerId) this.cancel()
  }
  cancel = () => {
    const g = this.gesture
    this.gesture = undefined
    cancelAnimationFrame(this.frame)
    this.frame = 0
    delete this.host.dataset.pdfPanning
    if (g && this.host.hasPointerCapture(g.pointer)) this.host.releasePointerCapture(g.pointer)
  }
  destroy() {
    this.cancel()
    this.host.removeEventListener("pointerdown", this.down)
    this.host.removeEventListener("pointermove", this.move)
    this.host.removeEventListener("pointerup", this.up)
    this.host.removeEventListener("pointercancel", this.lost)
    this.host.removeEventListener("lostpointercapture", this.lost)
    this.host.removeEventListener("rf-pdf-view-change", this.cancel)
    window.removeEventListener("blur", this.cancel)
    window.removeEventListener("resize", this.cancel)
  }
}
