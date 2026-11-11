import type { Annotation, Box, Point, StudyDocument } from "./study-data"
import type { PdfWorkspace, InkStyle } from "./workspace"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { editBounds, editLinearPoints, inkBounds, linearKind } from "./shapes"
import { STUDY_COLORS } from "./study-data"

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
  points?: Point[]
  members: { item: Annotation; group: SVGGElement }[]
}
export class PdfAnnotationEditor {
  private enabled = false
  private selected?: string
  private extra = new Set<string>()
  private clipboard: { item: Annotation; style?: InkStyle }[] = []
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
      before: Annotation[],
      after: Annotation[],
      current: () => boolean,
      styles?: Record<string, InkStyle>,
    ) => Promise<boolean>,
    private refresh: () => void,
    private workspace: PdfWorkspace,
  ) {
    host.addEventListener("pointerdown", this.down)
    host.addEventListener("pointermove", this.move)
    host.addEventListener("pointerup", this.up)
    host.addEventListener("pointercancel", this.lost)
    host.addEventListener("lostpointercapture", this.lost)
    host.addEventListener("scroll", this.scrolled)
    host.addEventListener("keydown", this.key)
    window.addEventListener("resize", this.interrupted)
    window.addEventListener("blur", this.interrupted)
  }
  private chosen() {
    const ids = new Set([this.selected, ...this.extra])
    return this.data()?.annotations.filter((a) => a.kind === "ink" && ids.has(a.id)) ?? []
  }
  enable(value: boolean) {
    this.cancel()
    this.enabled = value
    this.selected = undefined
    this.extra.clear()
    this.sync()
  }
  sync() {
    if (this.gesture) return
    const focused = this.overlay?.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.shapeControl
      : undefined
    this.overlay?.remove()
    this.overlay = undefined
    delete this.host.dataset.annotationEditing
    if (this.destroyed || !this.enabled || !this.selected) return
    const chosen = this.chosen(),
      item = chosen.find((a) => a.id === this.selected) ?? chosen[0]
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
    this.host.dataset.annotationEditing = "true"
    page.append(overlay)
    const move = document.createElement("button")
    move.type = "button"
    move.setAttribute("aria-label", "Di chuyển hình")
    move.title = "Kéo để di chuyển; phím mũi tên để chỉnh, Shift để bước lớn"
    move.dataset.shapeHandle = "move"
    move.dataset.shapeControl = "move"
    overlay.append(move)
    const linear = chosen.length === 1 && linearKind(item)
    for (const direction of linear
      ? ["start", "end"]
      : ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
      const handle = document.createElement("button")
      handle.type = "button"
      handle.setAttribute(
        "aria-label",
        direction === "start"
          ? "Chỉnh điểm đầu"
          : direction === "end"
            ? "Chỉnh điểm cuối"
            : `Đổi kích thước hình ${direction}`,
      )
      handle.title = "Kéo để đổi kích thước; phím mũi tên để chỉnh, Shift để bước lớn"
      handle.dataset.shapeHandle = direction
      handle.dataset.shapeControl = direction
      handle.className = `rf-shape-handle rf-shape-${direction}`
      overlay.append(handle)
    }
    const properties = document.createElement("div")
    properties.className = "rf-shape-properties"
    properties.setAttribute("role", "toolbar")
    properties.setAttribute("aria-label", "Sửa hình đã chọn")
    const count = document.createElement("strong")
    count.textContent = `${chosen.length} hình · Shift+bấm để chọn nhiều`
    properties.append(count)
    const names = ["Vàng", "Xanh lá", "Xanh dương", "Đỏ"]
    for (const [index, color] of STUDY_COLORS.entries()) {
      const button = document.createElement("button")
      button.type = "button"
      button.className = "rf-shape-color"
      button.style.setProperty("--annotation-color", color)
      button.dataset.shapeControl = color
      button.setAttribute("aria-label", `Đổi màu hình: ${names[index]}`)
      button.title = names[index]!
      button.setAttribute("aria-pressed", String(item.color === color))
      button.disabled = this.pending
      button.onclick = () => {
        if (item.color !== color) this.change(item, { ...item, color })
      }
      properties.append(button)
    }
    for (const [text, label, action] of [
      ["Copy", "Sao chép hình", () => this.copy()],
      ["Dán", "Dán hình", () => this.paste()],
      [
        "Nhân bản",
        "Nhân bản hình",
        () => {
          this.copy()
          this.paste()
        },
      ],
    ] as const) {
      const b = document.createElement("button")
      b.type = "button"
      b.textContent = text
      b.setAttribute("aria-label", label)
      b.disabled = this.pending || (label === "Dán hình" && !this.clipboard.length)
      b.onclick = action
      properties.append(b)
    }
    this.styleControls(properties, chosen)
    const remove = document.createElement("button")
    remove.type = "button"
    remove.textContent = "Xóa"
    remove.title = "Xóa hình (Delete); Ctrl+Z để hoàn tác"
    remove.dataset.shapeControl = "delete"
    remove.setAttribute("aria-label", "Xóa hình đã chọn")
    remove.disabled = this.pending
    remove.onclick = () => this.change(item, null)
    properties.append(remove)
    const done = document.createElement("button")
    done.type = "button"
    done.textContent = "×"
    done.dataset.shapeControl = "close"
    done.setAttribute("aria-label", "Bỏ chọn hình")
    done.onclick = () => {
      this.selected = undefined
      this.extra.clear()
      this.sync()
    }
    properties.append(done)
    const hint = document.createElement("small")
    hint.textContent = linear
      ? "Kéo để di chuyển · Kéo hai đầu để chỉnh · Shift: ngang/dọc/45°"
      : "Kéo hình để di chuyển · Kéo cạnh/góc để đổi kích thước"
    properties.append(hint)
    overlay.append(properties)
    if (linear) this.positionLinear(item.points, page.getBoundingClientRect())
    else this.position(inkBounds(chosen.flatMap((a) => a.points)))
    this.positionProperties()
    if (focused)
      overlay
        .querySelector<HTMLButtonElement>(`[data-shape-control="${focused}"]`)
        ?.focus({ preventScroll: true })
  }
  private positionProperties() {
    const properties = this.overlay?.querySelector<HTMLElement>(".rf-shape-properties")
    if (!properties || !this.overlay) return
    const box = this.overlay.getBoundingClientRect()
    const viewport = this.host.getBoundingClientRect()
    const width = Math.min(340, innerWidth - 16)
    properties.style.width = `${width}px`
    const height = properties.getBoundingClientRect().height
    properties.hidden = box.bottom < viewport.top || box.top > viewport.bottom
    Object.assign(properties.style, {
      width: `${width}px`,
      left: `${Math.max(8, Math.min(innerWidth - width - 8, box.left))}px`,
      top: `${Math.max(viewport.top + 4, Math.min(innerHeight - height - 8, box.top - height - 8 < viewport.top ? box.bottom + 10 : box.top - height - 8))}px`,
    })
  }
  private change(before: Annotation, after: Annotation | null) {
    if (this.pending || this.gesture || this.destroyed) return
    const epoch = this.epoch
    this.pending = true
    this.sync()
    const chosen = this.chosen()
    if (!chosen.includes(before)) {
      this.pending = false
      return
    }
    void this.save(
      chosen,
      after ? chosen.map((a) => ({ ...a, color: after.color })) : [],
      () => !this.destroyed && epoch === this.epoch,
    ).finally(() => {
      this.pending = false
      if (!this.destroyed) this.refresh()
    })
  }
  private copy() {
    const chosen = this.chosen(),
      styles = this.workspace.getSnapshot().data.styles
    if (chosen.length > 100 || chosen.reduce((n, a) => n + a.points.length, 0) > 20000) {
      this.workspace.fail(new Error("Mỗi lần sao chép tối đa 100 hình / 20.000 điểm."))
      return
    }
    this.clipboard = chosen.map((item) => ({
      item,
      style: Object.hasOwn(styles, item.id) ? styles[item.id] : undefined,
    }))
    this.sync()
  }
  private paste() {
    if (this.pending || this.gesture || this.destroyed || !this.clipboard.length) return
    const host = this.host.getBoundingClientRect()
    const pages = [...this.host.querySelectorAll<HTMLElement>(".rf-pdf-page[data-rendered=true]")]
    const page = pages.toSorted((a, b) => {
      const visible = (e: HTMLElement) => {
        const r = e.getBoundingClientRect()
        return Math.max(0, Math.min(r.bottom, host.bottom) - Math.max(r.top, host.top))
      }
      return visible(b) - visible(a)
    })[0]
    if (!page) return
    const points = this.clipboard.flatMap((c) => c.item.points),
      from = inkBounds(points)
    const to = editBounds(
      from,
      "move",
      from.x + from.width + 0.02 > 1 ? -0.02 : 0.02,
      from.y + from.height + 0.02 > 1 ? -0.02 : 0.02,
      0,
      0,
    )
    const styles: Record<string, InkStyle> = {}
    const items = this.clipboard.map((c) => {
      const id = getRandomUUID()
      if (c.style) styles[id] = c.style
      return {
        ...c.item,
        id,
        page: Number(page.dataset.page),
        points: this.transformedPoints({ item: c.item, from }, to),
      }
    })
    const epoch = this.epoch
    this.pending = true
    void this.save(
      [],
      items,
      () => !this.destroyed && epoch === this.epoch,
      Object.keys(styles).length ? styles : undefined,
    )
      .then((saved) => {
        if (saved && !this.destroyed) {
          this.selected = items[0]!.id
          this.extra = new Set(items.slice(1).map((a) => a.id))
        }
      })
      .finally(() => {
        this.pending = false
        if (!this.destroyed) this.refresh()
      })
  }
  private styleControls(properties: HTMLElement, chosen: Annotation[]) {
    const styles = this.workspace.getSnapshot().data.styles,
      first = (Object.hasOwn(styles, chosen[0]!.id) ? styles[chosen[0]!.id] : undefined) ?? {
        width: 2.5,
        opacity: 1,
        fill: "none",
      }
    const change = (patch: Partial<InkStyle>) => {
      if (this.pending || this.gesture || this.destroyed) return
      const epoch = this.epoch
      this.pending = true
      void this.workspace
        .edit(
          (data) => ({
            ...data,
            styles: {
              ...data.styles,
              ...Object.fromEntries(
                chosen.map((a) => [
                  a.id,
                  { width: 2.5, opacity: 1, fill: "none", ...data.styles[a.id], ...patch },
                ]),
              ),
            },
          }),
          () =>
            !this.destroyed &&
            epoch === this.epoch &&
            chosen.every((a) => this.data()?.annotations.find((n) => n.id === a.id) === a),
        )
        .finally(() => {
          this.pending = false
          if (!this.destroyed) this.refresh()
        })
    }
    for (const [label, key, options] of [
      [
        "Độ dày nét",
        "width",
        [
          ["1", "Mảnh"],
          ["1.5", "1,5"],
          ["2.5", "Vừa"],
          ["4", "Đậm"],
          ["6", "Rất đậm"],
          ["8", "8"],
        ],
      ],
      [
        "Độ đậm",
        "opacity",
        [
          ["1", "100%"],
          ["0.75", "75%"],
          ["0.5", "50%"],
          ["0.25", "25%"],
          ["0.1", "10%"],
        ],
      ],
      [
        "Màu nền hình",
        "fill",
        [
          ["none", "Không tô"],
          ...STUDY_COLORS.map((c, i) => [c, ["Vàng", "Xanh lá", "Xanh dương", "Đỏ"][i]!]),
        ],
      ],
    ] as const) {
      const wrapper = document.createElement("label"),
        select = document.createElement("select")
      wrapper.textContent = label
      select.setAttribute("aria-label", label)
      select.dataset.shapeControl = key
      for (const [value, text] of options) {
        const option = document.createElement("option")
        option.value = value
        option.textContent = text
        select.append(option)
      }
      select.value = String(first[key])
      select.disabled =
        this.pending ||
        (key === "fill" &&
          chosen.some((a) => JSON.stringify(a.points[0]) !== JSON.stringify(a.points.at(-1))))
      select.onchange = () =>
        change(key === "fill" ? { fill: select.value } : { [key]: Number(select.value) })
      wrapper.append(select)
      properties.append(wrapper)
    }
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
  private positionLinear(points: Point[], rect: Pick<DOMRect, "width" | "height">) {
    const box = inkBounds(points),
      padX = 9 / rect.width,
      padY = 9 / rect.height
    const left = Math.max(0, box.x - padX),
      top = Math.max(0, box.y - padY)
    const padded = {
      x: left,
      y: top,
      width: Math.min(1, box.x + box.width + padX) - left,
      height: Math.min(1, box.y + box.height + padY) - top,
    }
    this.position(padded)
    for (const [index, name] of ["start", "end"].entries()) {
      const handle = this.overlay?.querySelector<HTMLElement>(`[data-shape-handle="${name}"]`)
      if (handle)
        Object.assign(handle.style, {
          left: `${((points[index]!.x - left) / padded.width) * 100}%`,
          top: `${((points[index]!.y - top) / padded.height) * 100}%`,
        })
    }
  }
  private paintPoints(group: SVGGElement, points: Point[]) {
    const value = points.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" ")
    for (const path of group.querySelectorAll("polyline")) path.setAttribute("points", value)
  }
  private down = (event: PointerEvent) => {
    if (!this.enabled || this.pending || !event.isPrimary || event.button !== 0 || this.gesture)
      return
    const target = event.target as Element,
      handle = target.closest<HTMLElement>("[data-shape-handle]")
    if (target.closest(".rf-shape-properties")) {
      event.stopImmediatePropagation()
      return
    }
    const underneath =
      event.shiftKey && handle?.dataset.shapeHandle === "move"
        ? document
            .elementsFromPoint(event.clientX, event.clientY)
            .map((n) => n.closest<SVGElement>("[data-annotation]")?.dataset.annotation)
            .find(Boolean)
        : undefined
    const id =
      underneath ??
      (handle ? this.selected : target.closest<SVGElement>("[data-annotation]")?.dataset.annotation)
    const item = this.data()?.annotations.find((a) => a.id === id && a.kind === "ink")
    if (!item) {
      this.selected = undefined
      this.extra.clear()
      this.sync()
      return
    }
    const page = target.closest<HTMLElement>(".rf-pdf-page")!
    const group = [...page.querySelectorAll<SVGGElement>("g[data-annotation]")].find(
      (n) => n.dataset.annotation === item.id,
    )
    if (!group) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.shiftKey && (!handle || underneath)) {
      const primary = this.chosen()[0]
      if (!primary || primary.page !== item.page) {
        this.selected = item.id
        this.extra.clear()
      } else if (item.id === this.selected) {
        this.selected = [...this.extra][0]
        this.extra.delete(this.selected ?? "")
      } else if (this.extra.has(item.id)) this.extra.delete(item.id)
      else if (this.extra.size < 99) this.extra.add(item.id)
      this.sync()
      return
    }
    if (!this.chosen().some((a) => a.id === item.id)) {
      this.selected = item.id
      this.extra.clear()
    }
    this.sync()
    const members = this.chosen()
      .map((a) => ({
        item: a,
        group: [...page.querySelectorAll<SVGGElement>("g[data-annotation]")].find(
          (n) => n.dataset.annotation === a.id,
        )!,
      }))
      .filter((m) => !!m.group)
    const from = inkBounds(members.flatMap((m) => m.item.points))
    this.gesture = {
      pointer: event.pointerId,
      item: members[0]!.item,
      group: members[0]!.group,
      members,
      page,
      rect: page.getBoundingClientRect(),
      startX: event.clientX,
      startY: event.clientY,
      from,
      to: from,
      handle: handle?.dataset.shapeHandle ?? "move",
      frame: 0,
    }
    this.overlay?.querySelector<HTMLElement>(".rf-shape-properties")?.setAttribute("hidden", "")
    this.overlay
      ?.querySelector<HTMLButtonElement>(
        `[data-shape-handle="${handle?.dataset.shapeHandle ?? "move"}"]`,
      )
      ?.focus({ preventScroll: true })
    this.host.setPointerCapture(event.pointerId)
  }
  private paint = () => {
    const g = this.gesture
    if (!g) return
    g.frame = 0
    if (g.points) {
      this.paintPoints(g.group, g.points)
      this.positionLinear(g.points, g.rect)
      return
    }
    const sx = g.to.width / g.from.width,
      sy = g.to.height / g.from.height
    for (const member of g.members)
      member.group.setAttribute(
        "transform",
        `matrix(${sx} 0 0 ${sy} ${(g.to.x - g.from.x * sx) * 1000} ${(g.to.y - g.from.y * sy) * 1000})`,
      )
    if (g.members.length === 1 && linearKind(g.item))
      this.positionLinear(this.transformedPoints(g, g.to), g.rect)
    else this.position(g.to)
  }
  private move = (event: PointerEvent) => {
    const g = this.gesture
    if (!g || g.pointer !== event.pointerId) return
    if (!g.group.isConnected) {
      this.cancel()
      return
    }
    event.preventDefault()
    if (g.handle === "start" || g.handle === "end") {
      const origin = g.item.points[g.handle === "start" ? 0 : 1]!
      g.points = editLinearPoints(
        g.item,
        g.handle,
        {
          x: origin.x + (event.clientX - g.startX) / g.rect.width,
          y: origin.y + (event.clientY - g.startY) / g.rect.height,
        },
        g.rect.width,
        g.rect.height,
        event.shiftKey,
      )
      if (!g.frame) g.frame = requestAnimationFrame(this.paint)
      return
    }
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
    for (const member of g.members) member.group.removeAttribute("transform")
    if (g.points) this.paintPoints(g.group, g.item.points)
    if (this.host.hasPointerCapture(g.pointer)) this.host.releasePointerCapture(g.pointer)
  }
  private up = (event: PointerEvent) => {
    const g = this.gesture
    if (!g || g.pointer !== event.pointerId) return
    this.move(event)
    if (this.gesture !== g) return
    const to = g.to
    this.release()
    if (g.points) {
      this.commitPoints(g.item, g.group, g.points)
      return
    }
    if (JSON.stringify(g.from) === JSON.stringify(to)) {
      this.sync()
      return
    }
    this.commit(g, to)
  }
  private transformedPoints(g: Pick<Gesture, "item" | "from">, to: Box) {
    const clip = (n: number) => Math.max(0, Math.min(1, n))
    return g.item.points.map((p) => ({
      x: clip(to.x + ((p.x - g.from.x) / g.from.width) * to.width),
      y: clip(to.y + ((p.y - g.from.y) / g.from.height) * to.height),
    }))
  }
  private commitPoints(item: Annotation, group: SVGGElement, points: Point[]) {
    if (JSON.stringify(item.points) === JSON.stringify(points)) {
      this.sync()
      return
    }
    const epoch = this.epoch
    this.paintPoints(group, points)
    this.pending = true
    void this.save(
      [item],
      [{ ...item, points }],
      () => !this.destroyed && epoch === this.epoch,
    ).finally(() => {
      this.pending = false
      this.paintPoints(group, item.points)
      if (!this.destroyed) this.refresh()
    })
  }
  private commit(g: Pick<Gesture, "item" | "group" | "from" | "members">, to: Box) {
    if (JSON.stringify(g.from) === JSON.stringify(to)) {
      this.sync()
      return
    }
    const epoch = this.epoch
    const after = g.members.map((m) => ({
      ...m.item,
      points: this.transformedPoints({ ...g, item: m.item }, to),
    }))
    // Keep the final preview until the single revision-guarded write settles.
    const sx = to.width / g.from.width,
      sy = to.height / g.from.height
    for (const member of g.members)
      member.group.setAttribute(
        "transform",
        `matrix(${sx} 0 0 ${sy} ${(to.x - g.from.x * sx) * 1000} ${(to.y - g.from.y * sy) * 1000})`,
      )
    this.pending = true
    void this.save(
      g.members.map((m) => m.item),
      after,
      () => !this.destroyed && epoch === this.epoch,
    ).finally(() => {
      this.pending = false
      for (const member of g.members) member.group.removeAttribute("transform")
      if (!this.destroyed) this.refresh()
    })
  }
  private key = (event: KeyboardEvent) => {
    if (!this.enabled || (event.target as Element).closest("input,textarea,select")) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      if (this.gesture) this.cancel()
      return
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      ["c", "v", "d"].includes(event.key.toLowerCase()) &&
      (this.selected || this.clipboard.length) &&
      window.getSelection()?.isCollapsed !== false
    ) {
      event.preventDefault()
      event.stopPropagation()
      if (event.key.toLowerCase() !== "v") this.copy()
      if (event.key.toLowerCase() !== "c") this.paste()
      return
    }
    if (!this.selected) return
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      this.selected = undefined
      this.extra.clear()
      this.cancel()
      return
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (!(event.target as Element).closest(".rf-shape-selection")) return
      event.preventDefault()
      event.stopPropagation()
      const item = this.data()?.annotations.find((a) => a.id === this.selected && a.kind === "ink")
      if (item) this.change(item, null)
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
      from = inkBounds(this.chosen().flatMap((a) => a.points))
    if (handle === "start" || handle === "end") {
      const origin = item.points[handle === "start" ? 0 : 1]!
      this.commitPoints(
        item,
        group,
        editLinearPoints(
          item,
          handle,
          {
            x:
              origin.x +
              (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0) /
                box.width,
            y:
              origin.y +
              (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0) / box.height,
          },
          box.width,
          box.height,
        ),
      )
      return
    }
    const to = editBounds(
      from,
      handle,
      (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0) / box.width,
      (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0) / box.height,
      4 / box.width,
      4 / box.height,
    )
    const members = this.chosen()
      .map((a) => ({
        item: a,
        group: [...page.querySelectorAll<SVGGElement>("g[data-annotation]")].find(
          (n) => n.dataset.annotation === a.id,
        )!,
      }))
      .filter((m) => !!m.group)
    this.commit({ item, group, from, members }, to)
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
    else this.positionProperties()
  }
  private interrupted = () => {
    if (this.gesture) this.cancel()
    else this.positionProperties()
  }
  destroy() {
    this.destroyed = true
    this.clipboard = []
    this.cancel()
    this.overlay?.remove()
    delete this.host.dataset.annotationEditing
    this.host.removeEventListener("pointerdown", this.down)
    this.host.removeEventListener("pointermove", this.move)
    this.host.removeEventListener("pointerup", this.up)
    this.host.removeEventListener("pointercancel", this.lost)
    this.host.removeEventListener("lostpointercapture", this.lost)
    this.host.removeEventListener("scroll", this.scrolled)
    this.host.removeEventListener("keydown", this.key)
    window.removeEventListener("resize", this.interrupted)
    window.removeEventListener("blur", this.interrupted)
  }
}
