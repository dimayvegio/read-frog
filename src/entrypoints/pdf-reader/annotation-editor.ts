import type { Annotation, Box, StudyDocument } from "./study-data"
import { editBounds, inkBounds } from "./shapes"

type Gesture = {
  pointer: number
  item: Annotation
  group: SVGGElement
  page: HTMLElement
  rect: DOMRect
  startX: number
  startY: number
  from: Box
  to: Box
  handle: string
  frame: number
}
export class PdfAnnotationEditor {
  private enabled = false
  private selected?: string
  private overlay?: HTMLDivElement
  private gesture?: Gesture
  private epoch = 0
  private destroyed = false
  private pending = false
  get dragging() {
    return !!this.gesture
  }
  constructor(
    private host: HTMLElement,
    private data: () => StudyDocument | undefined,
    private save: (
      before: Annotation,
      after: Annotation,
      current: () => boolean,
    ) => Promise<boolean>,
    private refresh: () => void,
  ) {
    host.addEventListener("pointerdown", this.down)
    host.addEventListener("pointermove", this.move)
    host.addEventListener("pointerup", this.up)
    host.addEventListener("pointercancel", this.cancel)
    host.addEventListener("lostpointercapture", this.lost)
    host.addEventListener("scroll", this.scrolled)
    host.addEventListener("keydown", this.key)
    window.addEventListener("resize", this.interrupted)
    window.addEventListener("blur", this.interrupted)
  }
  enable(value: boolean) {
    this.cancel()
    this.enabled = value
    if (!value) this.selected = undefined
    this.sync()
  }
  sync() {
    if (this.gesture) return
    const focused = this.overlay?.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.shapeHandle
      : undefined
    this.overlay?.remove()
    this.overlay = undefined
    if (this.destroyed || !this.enabled || !this.selected) return
    const item = this.data()?.annotations.find((a) => a.id === this.selected && a.kind === "ink")
    const page =
      item &&
      this.host.querySelector<HTMLElement>(
        `.rf-pdf-page[data-page="${item.page}"][data-rendered=true]`,
      )
    if (!item || !page) return
    const overlay = document.createElement("div")
    overlay.className = "rf-shape-selection"
    overlay.dataset.shapeId = item.id
    this.overlay = overlay
    page.append(overlay)
    const move = document.createElement("button")
    move.type = "button"
    move.setAttribute("aria-label", "Di chuyển hình")
    move.title = "Kéo để di chuyển; phím mũi tên để chỉnh, Shift để bước lớn"
    move.dataset.shapeHandle = "move"
    overlay.append(move)
    for (const direction of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
      const handle = document.createElement("button")
      handle.type = "button"
      handle.setAttribute("aria-label", `Đổi kích thước hình ${direction}`)
      handle.title = "Kéo để đổi kích thước; phím mũi tên để chỉnh, Shift để bước lớn"
      handle.dataset.shapeHandle = direction
      handle.className = `rf-shape-handle rf-shape-${direction}`
      overlay.append(handle)
    }
    this.position(inkBounds(item.points))
    if (focused)
      overlay
        .querySelector<HTMLButtonElement>(`[data-shape-handle="${focused}"]`)
        ?.focus({ preventScroll: true })
  }
  private position(box: Box) {
    if (this.overlay)
      Object.assign(this.overlay.style, {
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.width * 100}%`,
        height: `${box.height * 100}%`,
      })
  }
  private down = (event: PointerEvent) => {
    if (!this.enabled || this.pending || !event.isPrimary || event.button !== 0 || this.gesture)
      return
    const target = event.target as Element,
      handle = target.closest<HTMLElement>("[data-shape-handle]")
    const id = handle
      ? this.selected
      : target.closest<SVGElement>("[data-annotation]")?.dataset.annotation
    const item = this.data()?.annotations.find((a) => a.id === id && a.kind === "ink")
    if (!item) {
      this.selected = undefined
      this.sync()
      return
    }
    const page = target.closest<HTMLElement>(".rf-pdf-page")!
    const group = [...page.querySelectorAll<SVGGElement>("g[data-annotation]")].find(
      (n) => n.dataset.annotation === item.id,
    )
    if (!group) return
    event.preventDefault()
    this.selected = item.id
    this.sync()
    const from = inkBounds(item.points)
    this.gesture = {
      pointer: event.pointerId,
      item,
      group,
      page,
      rect: page.getBoundingClientRect(),
      startX: event.clientX,
      startY: event.clientY,
      from,
      to: from,
      handle: handle?.dataset.shapeHandle ?? "move",
      frame: 0,
    }
    this.host.setPointerCapture(event.pointerId)
  }
  private paint = () => {
    const g = this.gesture
    if (!g) return
    g.frame = 0
    const sx = g.to.width / g.from.width,
      sy = g.to.height / g.from.height
    g.group.setAttribute(
      "transform",
      `matrix(${sx} 0 0 ${sy} ${(g.to.x - g.from.x * sx) * 1000} ${(g.to.y - g.from.y * sy) * 1000})`,
    )
    this.position(g.to)
  }
  private move = (event: PointerEvent) => {
    const g = this.gesture
    if (!g || g.pointer !== event.pointerId) return
    if (!g.group.isConnected) {
      this.cancel()
      return
    }
    event.preventDefault()
    g.to = editBounds(
      g.from,
      g.handle,
      (event.clientX - g.startX) / g.rect.width,
      (event.clientY - g.startY) / g.rect.height,
      4 / g.rect.width,
      4 / g.rect.height,
    )
    if (!g.frame) g.frame = requestAnimationFrame(this.paint)
  }
  private release() {
    const g = this.gesture
    this.gesture = undefined
    if (!g) return
    cancelAnimationFrame(g.frame)
    g.group.removeAttribute("transform")
    if (this.host.hasPointerCapture(g.pointer)) this.host.releasePointerCapture(g.pointer)
  }
  private up = (event: PointerEvent) => {
    const g = this.gesture
    if (!g || g.pointer !== event.pointerId) return
    this.move(event)
    if (this.gesture !== g) return
    const to = g.to
    this.release()
    if (JSON.stringify(g.from) === JSON.stringify(to)) {
      this.sync()
      return
    }
    this.commit(g, to)
  }
  private commit(g: Pick<Gesture, "item" | "group" | "from">, to: Box) {
    const epoch = this.epoch
    const clip = (n: number) => Math.max(0, Math.min(1, n))
    const after = {
      ...g.item,
      points: g.item.points.map((p) => ({
        x: clip(to.x + ((p.x - g.from.x) / g.from.width) * to.width),
        y: clip(to.y + ((p.y - g.from.y) / g.from.height) * to.height),
      })),
    }
    // Keep the final preview until the single revision-guarded write settles.
    const sx = to.width / g.from.width,
      sy = to.height / g.from.height
    g.group.setAttribute(
      "transform",
      `matrix(${sx} 0 0 ${sy} ${(to.x - g.from.x * sx) * 1000} ${(to.y - g.from.y * sy) * 1000})`,
    )
    this.pending = true
    void this.save(g.item, after, () => !this.destroyed && epoch === this.epoch).finally(() => {
      this.pending = false
      g.group.removeAttribute("transform")
      if (!this.destroyed) this.refresh()
    })
  }
  private key = (event: KeyboardEvent) => {
    if (!this.enabled || !this.selected) return
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      this.selected = undefined
      this.cancel()
      return
    }
    const handle = (event.target as HTMLElement).dataset.shapeHandle
    if (!handle || !event.key.startsWith("Arrow")) return
    event.preventDefault()
    event.stopPropagation()
    if (this.pending || this.gesture) return
    const item = this.data()?.annotations.find((a) => a.id === this.selected && a.kind === "ink")
    const page = (event.target as Element).closest<HTMLElement>(".rf-pdf-page")
    const group =
      page &&
      [...page.querySelectorAll<SVGGElement>("g[data-annotation]")].find(
        (n) => n.dataset.annotation === item?.id,
      )
    if (!item || !page || !group) return
    const box = page.getBoundingClientRect(),
      step = event.shiftKey ? 10 : 1,
      from = inkBounds(item.points)
    const to = editBounds(
      from,
      handle,
      (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0) / box.width,
      (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0) / box.height,
      4 / box.width,
      4 / box.height,
    )
    this.commit({ item, group, from }, to)
  }
  cancel = () => {
    if (this.gesture) ++this.epoch
    this.release()
    this.sync()
  }
  private lost = (event: PointerEvent) => {
    if (this.gesture?.pointer === event.pointerId) this.cancel()
  }
  private scrolled = () => {
    if (this.gesture) this.cancel()
  }
  private interrupted = () => {
    if (this.gesture) this.cancel()
  }
  destroy() {
    this.destroyed = true
    this.cancel()
    this.overlay?.remove()
    this.host.removeEventListener("pointerdown", this.down)
    this.host.removeEventListener("pointermove", this.move)
    this.host.removeEventListener("pointerup", this.up)
    this.host.removeEventListener("pointercancel", this.cancel)
    this.host.removeEventListener("lostpointercapture", this.lost)
    this.host.removeEventListener("scroll", this.scrolled)
    this.host.removeEventListener("keydown", this.key)
    window.removeEventListener("resize", this.interrupted)
    window.removeEventListener("blur", this.interrupted)
  }
}
