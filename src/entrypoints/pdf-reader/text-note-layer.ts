import type { TextNote, PdfTextNotes } from "./text-notes"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { editBounds } from "./shapes"
import { TEXT_NOTE_COLORS } from "./text-notes"
export class PdfTextNoteLayer {
  private clicked?: { id: string; time: number }
  private selected?: string
  private unsubscribe: () => void
  private frame = 0
  private closed = false
  private gesture?: {
    pointer: number
    note: TextNote
    node: HTMLElement
    rect: DOMRect
    x: number
    y: number
    box: TextNote
    handle: string
  }
  constructor(
    private host: HTMLElement,
    private store: PdfTextNotes,
    private edit: (note: TextNote) => void,
  ) {
    this.unsubscribe = store.subscribe(this.render)
    host.addEventListener("rf-pdf-render", this.render)
    host.addEventListener("rf-pdf-view-change", this.cancel)
    host.addEventListener("pointerdown", this.down)
    host.addEventListener("pointermove", this.move)
    host.addEventListener("pointerup", this.up)
    host.addEventListener("pointercancel", this.lost)
    host.addEventListener("lostpointercapture", this.lost)
    host.addEventListener("scroll", this.cancel)
    host.addEventListener("keydown", this.key)
    window.addEventListener("blur", this.cancel)
    this.render()
  }
  private editor?: HTMLFormElement
  openEditor(note: TextNote) {
    this.editor?.remove()
    const page = this.host.querySelector<HTMLElement>(
      `.rf-pdf-page[data-page="${note.page}"][data-rendered=true]`,
    )
    if (!page) return
    const form = document.createElement("form")
    form.className = "rf-inline-text-editor"
    Object.assign(form.style, {
      left: `${note.x * 100}%`,
      top: `${note.y * 100}%`,
      width: `${Math.max(0.25, note.width) * 100}%`,
    })
    const input = document.createElement("textarea")
    input.setAttribute("aria-label", "Nội dung ô chữ")
    input.maxLength = 2000
    input.value = note.text
    input.placeholder = "Nhập chữ tại đây…"
    const color = document.createElement("select")
    color.setAttribute("aria-label", "Màu ô chữ")
    for (const [i, c] of TEXT_NOTE_COLORS.entries()) {
      const option = new Option(["Đen", "Vàng", "Xanh lá", "Xanh dương", "Đỏ"][i], c)
      color.add(option)
    }
    color.value = note.color
    const font = document.createElement("select")
    font.setAttribute("aria-label", "Cỡ ô chữ")
    for (const n of [0.02, 0.025, 0.03, 0.04, 0.05])
      font.add(new Option(`${Math.round(n * 1000)}`, String(n)))
    font.value = String(note.font)
    const paint = () => {
      input.style.color = color.value
      input.style.fontSize = `${Number(font.value) * page.clientWidth}px`
    }
    color.onchange = paint
    font.onchange = paint
    paint()
    const actions = document.createElement("div"),
      save = document.createElement("button"),
      cancel = document.createElement("button")
    save.type = "submit"
    save.textContent = "Lưu ô chữ"
    cancel.type = "button"
    cancel.textContent = "Hủy"
    cancel.onclick = () => {
      form.remove()
      this.editor = undefined
    }
    actions.append(color, font, save, cancel)
    form.append(input, actions)
    page.append(form)
    this.editor = form
    const previous = this.store.getSnapshot().data.notes.find((n) => n.id === note.id)
    form.onpointerdown = (e) => e.stopPropagation()
    form.onclick = (e) => e.stopPropagation()
    form.onkeydown = (e) => {
      e.stopPropagation()
      if (e.key === "Escape") {
        form.remove()
        this.editor = undefined
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault()
        form.requestSubmit()
      }
    }
    form.onsubmit = async (e) => {
      e.preventDefault()
      if (save.disabled || !input.value.trim()) return
      save.disabled = true
      const ok = await this.store.edit(
        (notes) => {
          const current = notes.find((n) => n.id === note.id)
          if (current !== previous) throw new Error("Ô chữ đã đổi. Mở lại trước khi sửa.")
          return [
            ...notes.filter((n) => n.id !== note.id),
            {
              ...(current ?? note),
              text: input.value.trim().normalize("NFC"),
              color: color.value,
              font: Number(font.value),
            },
          ]
        },
        () => !this.closed && this.editor === form && form.isConnected,
      )
      if (ok) {
        form.remove()
        this.editor = undefined
      }
      save.disabled = false
    }
    input.focus({ preventScroll: true })
  }
  render = () => {
    if (this.closed || this.gesture) return
    for (const page of this.host.querySelectorAll<HTMLElement>(
      ".rf-pdf-page[data-rendered=true]",
    )) {
      page.querySelector(".rf-pdf-text-notes")?.remove()
      const layer = document.createElement("div")
      layer.className = "rf-pdf-text-notes"
      for (const note of this.store
        .getSnapshot()
        .data.notes.filter((n) => n.page === Number(page.dataset.page))) {
        const box = document.createElement("div")
        box.className = "rf-text-note"
        box.dataset.noteId = note.id
        box.tabIndex = 0
        box.setAttribute("role", "button")
        box.setAttribute("aria-label", `Ô chữ: ${note.text.slice(0, 80)}`)
        box.textContent = note.text
        this.position(box, note)
        box.style.color = note.color
        box.style.fontSize = `${note.font * page.clientWidth}px`
        box.classList.toggle("selected", note.id === this.selected)
        box.title = "Kéo để di chuyển; bấm đúp hoặc Enter để sửa chữ"
        box.ondblclick = () => this.edit(note)
        if (note.id === this.selected)
          for (const direction of ["nw", "ne", "se", "sw"]) {
            const handle = document.createElement("span")
            handle.className = `rf-shape-handle rf-shape-${direction}`
            handle.dataset.noteHandle = direction
            box.append(handle)
          }
        layer.append(box)
      }
      page.append(layer)
    }
  }
  private position(node: HTMLElement, box: TextNote) {
    Object.assign(node.style, {
      left: `${box.x * 100}%`,
      top: `${box.y * 100}%`,
      width: `${box.width * 100}%`,
      height: `${box.height * 100}%`,
    })
  }
  private down = (event: PointerEvent) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      this.gesture ||
      (event.target as Element).closest(
        ".rf-inline-text-editor,.rf-sticky-marker,.rf-sticky-editor",
      )
    )
      return
    const mode = this.host.dataset.studyTool
    if (!["select", "edit", "textbox"].includes(mode ?? "")) return
    const target = event.target as HTMLElement,
      page = target.closest<HTMLElement>(".rf-pdf-page[data-rendered=true]")
    if (!page) return
    const node = target.closest<HTMLElement>("[data-note-id]"),
      note = this.store.getSnapshot().data.notes.find((n) => n.id === node?.dataset.noteId)
    if (!note) {
      this.selected = undefined
      this.render()
      if (mode === "textbox") {
        event.preventDefault()
        event.stopImmediatePropagation()
        const rect = page.getBoundingClientRect(),
          x = Math.max(0, Math.min(0.8, (event.clientX - rect.left) / rect.width)),
          y = Math.max(0, Math.min(0.9, (event.clientY - rect.top) / rect.height))
        this.edit({
          id: getRandomUUID(),
          page: Number(page.dataset.page),
          x,
          y,
          width: Math.min(0.35, 1 - x),
          height: Math.min(0.12, 1 - y),
          font: 0.025,
          color: "#17212e",
          text: "",
        })
      }
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    this.selected = note.id
    this.render()
    const current = [...page.querySelectorAll<HTMLElement>("[data-note-id]")].find(
      (n) => n.dataset.noteId === note.id,
    )!
    this.gesture = {
      pointer: event.pointerId,
      note,
      node: current,
      rect: page.getBoundingClientRect(),
      x: event.clientX,
      y: event.clientY,
      box: note,
      handle: target.dataset.noteHandle ?? "move",
    }
    current.focus({ preventScroll: true })
    this.host.setPointerCapture(event.pointerId)
  }
  private paint = () => {
    this.frame = 0
    const g = this.gesture
    if (g) this.position(g.node, g.box)
  }
  private move = (event: PointerEvent) => {
    const g = this.gesture
    if (!g || g.pointer !== event.pointerId) return
    event.preventDefault()
    g.box = {
      ...g.note,
      ...editBounds(
        g.note,
        g.handle,
        (event.clientX - g.x) / g.rect.width,
        (event.clientY - g.y) / g.rect.height,
        20 / g.rect.width,
        20 / g.rect.height,
      ),
    }
    if (!this.frame) this.frame = requestAnimationFrame(this.paint)
  }
  private up = (event: PointerEvent) => {
    const g = this.gesture
    if (!g || g.pointer !== event.pointerId) return
    this.move(event)
    const after = g.box
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.paint()
    this.gesture = undefined
    if (this.host.hasPointerCapture(g.pointer)) this.host.releasePointerCapture(g.pointer)
    const changed = JSON.stringify(after) !== JSON.stringify(g.note)
    if (!changed) {
      if (this.clicked?.id === g.note.id && performance.now() - this.clicked.time < 450) {
        this.edit(g.note)
        this.clicked = undefined
      } else this.clicked = { id: g.note.id, time: performance.now() }
    }

    if (JSON.stringify(after) !== JSON.stringify(g.note))
      void this.store
        .edit(
          (notes) => {
            if (!notes.includes(g.note)) throw new Error("Ô chữ đã thay đổi. Hãy chọn lại.")
            return notes.map((n) => (n.id === g.note.id ? after : n))
          },
          () => !this.closed,
        )
        .finally(this.render)
  }
  cancel = () => {
    const g = this.gesture
    this.gesture = undefined
    cancelAnimationFrame(this.frame)
    this.frame = 0
    if (g && this.host.hasPointerCapture(g.pointer)) this.host.releasePointerCapture(g.pointer)
    if (g) this.render()
  }
  private lost = (event: PointerEvent) => {
    if (this.gesture?.pointer === event.pointerId) this.cancel()
  }
  private key = (event: KeyboardEvent) => {
    const id = (event.target as HTMLElement).closest<HTMLElement>("[data-note-id]")?.dataset.noteId
    if (!id) return
    if (event.key === "Enter") {
      event.preventDefault()
      const note = this.store.getSnapshot().data.notes.find((n) => n.id === id)
      if (note) this.edit(note)
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault()
      event.stopPropagation()
      void this.store.edit((notes) => notes.filter((n) => n.id !== id))
    } else if (event.key === "Escape") {
      this.cancel()
      this.selected = undefined
      this.render()
    }
  }
  destroy() {
    this.editor?.remove()
    this.closed = true
    this.cancel()
    this.unsubscribe()
    this.host.removeEventListener("rf-pdf-render", this.render)
    this.host.removeEventListener("rf-pdf-view-change", this.cancel)
    this.host.removeEventListener("pointerdown", this.down)
    this.host.removeEventListener("pointermove", this.move)
    this.host.removeEventListener("pointerup", this.up)
    this.host.removeEventListener("pointercancel", this.lost)
    this.host.removeEventListener("lostpointercapture", this.lost)
    this.host.removeEventListener("scroll", this.cancel)
    this.host.removeEventListener("keydown", this.key)
    window.removeEventListener("blur", this.cancel)
    for (const layer of this.host.querySelectorAll(".rf-pdf-text-notes")) layer.remove()
  }
}
