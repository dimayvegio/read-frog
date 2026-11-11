import type { Annotation, Box, OcrPage, Point, StudyDocument } from "./study-data"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { PdfAnnotationEditor } from "./annotation-editor"
import { shapePoints, type ShapeTool } from "./shapes"
import { inkBounds } from "./shapes"
import {
  validBox,
  searchText,
  normalizePdfSearch,
  pdfRunSeparator,
  joinPdfRuns,
} from "./study-data"

export type StudyTool = "select" | "edit" | "ink" | "erase" | "note" | ShapeTool
const ns = "http://www.w3.org/2000/svg"
const clamp = (n: number) => Math.max(0, Math.min(1, n))
function svg(name: string, attributes: Record<string, string>) {
  const element = document.createElementNS(ns, name)
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
  return element
}
export class PdfStudyLayer {
  tool: StudyTool = "select"
  color = "#ffca28"
  private data?: StudyDocument
  private query = ""
  private ocrIdentity = new WeakMap<Element, OcrPage>()
  private focused?: { page: number; index: number }
  private focusPending = false
  private focusFrame = 0
  focusMatch(page: number, index: number) {
    this.focused = { page, index }
    this.focusPending = true
    this.refresh()
  }
  private drawing?: {
    page: HTMLElement
    pointer: number
    points: Point[]
    origin: Point
    shape?: ShapeTool
    color: string
    path: Element
    frame: number
    rect: DOMRect
    end: Point
    constrain: boolean
  }
  private editor: PdfAnnotationEditor
  constructor(
    private host: HTMLElement,
    private add: (items: Annotation[]) => void,
    private erase: (id: string) => void,
    update: (
      before: Annotation,
      after: Annotation | null,
      current: () => boolean,
    ) => Promise<boolean>,
  ) {
    this.editor = new PdfAnnotationEditor(
      host,
      () => this.data,
      update,
      () => this.refresh(),
    )
    host.addEventListener("rf-pdf-render", this.refresh)
    host.addEventListener("pointerdown", this.down)
    host.addEventListener("pointermove", this.move)
    host.addEventListener("pointerup", this.up)
    host.addEventListener("pointercancel", this.cancel)
    host.addEventListener("lostpointercapture", this.cancel)
    host.addEventListener("scroll", this.cancel)
    window.addEventListener("resize", this.cancel)
    window.addEventListener("blur", this.cancel)
  }
  set(data: StudyDocument, query = this.query) {
    this.data = data
    this.query = query
    this.refresh()
  }
  setTool(tool: StudyTool) {
    this.cancel()
    this.tool = tool
    this.host.dataset.studyTool = tool
    this.editor.enable(tool !== "erase" && tool !== "note")
    this.refresh()
  }
  private refresh = () => {
    if (!this.data || this.drawing || this.editor.dragging) return
    for (const page of this.host.querySelectorAll<HTMLElement>(
      ".rf-pdf-page[data-rendered=true]",
    )) {
      const number = Number(page.dataset.page),
        cached = this.data.ocr.find((p) => p.page === number)
      const old = page.querySelector<HTMLElement>(".rf-ocr-text")
      // Do not replace an unchanged OCR layer: selections and paragraph IDs stay stable.
      if (cached && (!old || this.ocrIdentity.get(old) !== cached)) {
        old?.remove()
        this.ocr(page, cached)
      } else if (!cached) old?.remove()
      page.classList.toggle("rf-has-ocr", !!cached?.words.length)
      page.querySelector(".rf-study-overlay")?.remove()
      const overlay = svg("svg", {
        class: "rf-study-overlay",
        viewBox: "0 0 1000 1000",
        preserveAspectRatio: "none",
        "aria-hidden": "true",
      })
      for (const item of this.data.annotations.filter((a) => a.page === number)) {
        const group = svg("g", { "data-annotation": item.id, fill: item.color, stroke: item.color })
        const title = svg("title", {})
        title.textContent = item.text || (item.kind === "ink" ? "Nét vẽ" : "Tô sáng")
        group.append(title)
        for (const box of item.boxes)
          group.append(
            svg("rect", {
              x: String(box.x * 1000),
              y: String(box.y * 1000),
              width: String(box.width * 1000),
              height: String(box.height * 1000),
              opacity: "0.33",
              stroke: "none",
            }),
          )
        if (item.kind === "ink") {
          group.append(
            svg("polyline", {
              points: item.points.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" "),
              fill: "none",
              "stroke-width": "2.5",
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
            }),
          )
          const hit = svg("polyline", {
            points: item.points.map((p) => `${p.x * 1000},${p.y * 1000}`).join(" "),
            fill: "none",
            stroke: "transparent",
            "stroke-width": "10",
            "vector-effect": "non-scaling-stroke",
            "data-shape-hit": "true",
          })
          group.append(hit)
        }
        if (item.kind === "ink" && this.tool === "edit") {
          const box = inkBounds(item.points)
          group.append(
            svg("rect", {
              x: String(box.x * 1000),
              y: String(box.y * 1000),
              width: String(box.width * 1000),
              height: String(box.height * 1000),
              fill: "transparent",
              stroke: "none",
            }),
          )
        }
        if (item.kind === "note") {
          const p = item.points[0]!
          group.append(
            svg("rect", {
              x: String(p.x * 1000),
              y: String(p.y * 1000),
              width: "20",
              height: "20",
              stroke: "#333",
            }),
          )
        }
        overlay.append(group)
      }
      page.append(overlay)
      page.querySelector(".rf-search-overlay")?.remove()
      if (this.query) this.search(page)
    }
    this.editor.sync()
  }
  private ocr(page: HTMLElement, cached: OcrPage) {
    const layer = document.createElement("div")
    layer.className = "rf-ocr-text"
    this.ocrIdentity.set(layer, cached)
    const context = document.createElement("canvas").getContext("2d")!
    for (const [index, word] of cached.words.entries()) {
      const span = document.createElement("span")
      span.textContent = word.text + pdfRunSeparator(word.text, cached.words[index + 1]?.text ?? "")
      const height = word.height * page.clientHeight
      context.font = `${height}px Arial`
      Object.assign(span.style, {
        left: `${word.x * 100}%`,
        top: `${word.y * 100}%`,
        fontSize: `${height}px`,
        height: `${height}px`,
        transform: `scaleX(${(word.width * page.clientWidth) / Math.max(1, context.measureText(word.text).width)})`,
      })
      layer.append(span)
    }
    page.append(layer)
  }
  private search(page: HTMLElement) {
    const layer = page.querySelector(".rf-ocr-text") ?? page.querySelector(".textLayer")
    if (!layer) return
    const spans = [...layer.querySelectorAll<HTMLElement>("span")].filter(
      (s) => !s.childElementCount && s.textContent?.trim(),
    )
    const runs = spans.map((span) => {
      const raw = span.textContent,
        left = raw.length - raw.trimStart().length
      const starts: number[] = [],
        ends: number[] = []
      let text = ""
      for (const { segment, index } of new Intl.Segmenter(undefined, {
        granularity: "grapheme",
      }).segment(raw.trim())) {
        for (const char of normalizePdfSearch(segment)) {
          if (char === " " && text.endsWith(" ")) continue
          text += char
          for (let i = 0; i < char.length; i++) {
            starts.push(left + index)
            ends.push(left + index + segment.length)
          }
        }
      }
      return { span, text, starts, ends }
    })
    const positions = searchText(joinPdfRuns(runs.map((r) => r.text)), this.query)
    const overlay = document.createElement("div")
    overlay.className = "rf-search-overlay"
    const base = page.getBoundingClientRect()
    let offset = 0
    for (const [runIndex, run] of runs.entries()) {
      const end = offset + run.text.length
      for (const [index, match] of positions.entries()) {
        if (match.start >= end || match.end <= offset) continue
        const start = run.starts[Math.max(0, match.start - offset)],
          finish = run.ends[Math.min(run.text.length, match.end - offset) - 1]
        const node = run.span.firstChild
        if (
          start === undefined ||
          finish === undefined ||
          !node ||
          node.nodeType !== Node.TEXT_NODE
        )
          continue
        const range = document.createRange()
        range.setStart(node, start)
        range.setEnd(node, finish)
        for (const box of range.getClientRects()) {
          const marker = document.createElement("div")
          if (Number(page.dataset.page) === this.focused?.page && index === this.focused.index)
            marker.className = "active"
          Object.assign(marker.style, {
            left: `${box.left - base.left}px`,
            top: `${box.top - base.top}px`,
            width: `${box.width}px`,
            height: `${box.height}px`,
          })
          overlay.append(marker)
        }
      }
      offset = end + pdfRunSeparator(run.text, runs[runIndex + 1]?.text ?? "").length
    }
    page.append(overlay)
    if (this.focusPending && Number(page.dataset.page) === this.focused?.page) {
      const marker = overlay.querySelector<HTMLElement>(".active")
      if (marker) {
        this.focusPending = false
        cancelAnimationFrame(this.focusFrame)
        this.focusFrame = requestAnimationFrame(() => {
          if (marker.isConnected)
            this.host.scrollTop +=
              marker.getBoundingClientRect().top -
              this.host.getBoundingClientRect().top -
              this.host.clientHeight * 0.3
        })
      }
    }
  }
  highlight(): Annotation[] {
    const selection = window.getSelection()
    if (
      !selection?.rangeCount ||
      !selection.anchorNode ||
      !selection.focusNode ||
      !this.host.contains(selection.anchorNode) ||
      !this.host.contains(selection.focusNode)
    )
      return []
    const range = selection.getRangeAt(0),
      items: Annotation[] = []
    for (const page of this.host.querySelectorAll<HTMLElement>(
      ".rf-pdf-page[data-rendered=true]",
    )) {
      const base = page.getBoundingClientRect(),
        boxes: Box[] = []
      for (const rect of range.getClientRects()) {
        const left = Math.max(base.left, rect.left),
          top = Math.max(base.top, rect.top)
        const right = Math.min(base.right, rect.right),
          bottom = Math.min(base.bottom, rect.bottom)
        const box = {
          x: (left - base.left) / base.width,
          y: (top - base.top) / base.height,
          width: (right - left) / base.width,
          height: (bottom - top) / base.height,
        }
        if (
          validBox(box) &&
          !boxes.some(
            (b) =>
              Math.abs(b.x - box.x) < 0.001 &&
              Math.abs(b.y - box.y) < 0.001 &&
              Math.abs(b.width - box.width) < 0.001,
          )
        )
          boxes.push(box)
      }
      if (boxes.length)
        items.push({
          id: getRandomUUID(),
          page: Number(page.dataset.page),
          kind: "highlight",
          color: this.color,
          boxes,
          points: [],
          text: selection.toString().slice(0, 2000),
        })
    }
    return items
  }
  private point(event: PointerEvent, page: HTMLElement): Point {
    const box = page.getBoundingClientRect()
    return {
      x: clamp((event.clientX - box.left) / box.width),
      y: clamp((event.clientY - box.top) / box.height),
    }
  }
  private down = (event: PointerEvent) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      this.tool === "select" ||
      this.tool === "edit" ||
      this.drawing
    )
      return
    const target = event.target as Element
    const page = target.closest<HTMLElement>(".rf-pdf-page[data-rendered=true]")
    if (!page || target.closest("button")) return
    event.preventDefault()
    if (this.tool === "erase") {
      const id = target.closest<HTMLElement>("[data-annotation]")?.dataset.annotation
      if (id) this.erase(id)
      return
    }
    const point = this.point(event, page)
    if (this.tool === "note") {
      const text = window.prompt("Nội dung ghi chú (tối đa 2.000 ký tự):")?.trim()
      if (text)
        this.add([
          {
            id: getRandomUUID(),
            page: Number(page.dataset.page),
            kind: "note",
            color: this.color,
            boxes: [],
            points: [point],
            text: text.slice(0, 2000),
          },
        ])
      return
    }
    const overlay = page.querySelector(".rf-study-overlay")!
    const path = svg("polyline", {
      fill: "none",
      stroke: this.color,
      "stroke-width": "2.5",
      "stroke-linecap": "round",
    })
    overlay.append(path)
    this.drawing = {
      page,
      pointer: event.pointerId,
      points: [point],
      origin: point,
      shape: this.tool === "ink" ? undefined : this.tool,
      color: this.color,
      path,
      frame: 0,
      rect: page.getBoundingClientRect(),
      end: point,
      constrain: event.shiftKey,
    }
    this.host.setPointerCapture(event.pointerId)
  }
  private move = (event: PointerEvent) => {
    const drawing = this.drawing
    if (!drawing || drawing.pointer !== event.pointerId) return
    event.preventDefault()
    const p = {
        x: clamp((event.clientX - drawing.rect.left) / drawing.rect.width),
        y: clamp((event.clientY - drawing.rect.top) / drawing.rect.height),
      },
      last = drawing.points.at(-1)!
    drawing.end = p
    drawing.constrain = event.shiftKey
    if (drawing.shape) {
      // Compute geometry once per animation frame, not once per pointer event.
    } else {
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.001 || drawing.points.length >= 4096) return
      drawing.points.push(p)
    }
    if (!drawing.frame)
      drawing.frame = requestAnimationFrame(() => {
        if (drawing.shape)
          drawing.points = shapePoints(
            drawing.shape,
            drawing.origin,
            drawing.end,
            drawing.rect.width,
            drawing.rect.height,
            drawing.constrain,
          )
        drawing.path.setAttribute(
          "points",
          drawing.points.map((position) => `${position.x * 1000},${position.y * 1000}`).join(" "),
        )
        drawing.frame = 0
      })
  }
  private up = (event: PointerEvent) => {
    const drawing = this.drawing
    if (!drawing || drawing.pointer !== event.pointerId) return
    this.move(event)
    if (drawing.shape)
      drawing.points = shapePoints(
        drawing.shape,
        drawing.origin,
        drawing.end,
        drawing.rect.width,
        drawing.rect.height,
        drawing.constrain,
      )
    this.cancel()
    if (drawing.points.length >= 2)
      this.add([
        {
          id: getRandomUUID(),
          page: Number(drawing.page.dataset.page),
          kind: "ink",
          color: drawing.color,
          points: drawing.points,
          boxes: [],
          text: "",
        },
      ])
  }
  private cancel = () => {
    const drawing = this.drawing
    this.drawing = undefined
    if (!drawing) return
    cancelAnimationFrame(drawing.frame)
    drawing.path.remove()
    if (this.host.hasPointerCapture(drawing.pointer))
      this.host.releasePointerCapture(drawing.pointer)
  }
  destroy() {
    this.editor.destroy()
    this.cancel()
    cancelAnimationFrame(this.focusFrame)
    this.host.removeEventListener("rf-pdf-render", this.refresh)
    this.host.removeEventListener("pointerdown", this.down)
    this.host.removeEventListener("pointermove", this.move)
    this.host.removeEventListener("pointerup", this.up)
    this.host.removeEventListener("pointercancel", this.cancel)
    this.host.removeEventListener("lostpointercapture", this.cancel)
    this.host.removeEventListener("scroll", this.cancel)
    window.removeEventListener("resize", this.cancel)
    window.removeEventListener("blur", this.cancel)
    delete this.host.dataset.studyTool
    for (const node of this.host.querySelectorAll(
      ".rf-study-overlay,.rf-ocr-text,.rf-search-overlay",
    ))
      node.remove()
    for (const node of this.host.querySelectorAll(".rf-has-ocr"))
      node.classList.remove("rf-has-ocr")
  }
}
