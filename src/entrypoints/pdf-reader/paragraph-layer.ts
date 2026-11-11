import type { ViewPosition } from "./viewport"
import type { PdfWorkspace } from "./workspace"
import { paragraphSource } from "./paragraph-edits"
import {
  extractPdfParagraphs,
  MAX_PDF_TEXT_BOXES,
  paragraphAt,
  type PdfParagraphPage,
  type PdfTextBox,
  type PdfParagraph,
} from "./paragraphs"
export interface BilingualSnapshot extends PdfParagraphPage {
  status: "off" | "loading" | "ready"
  activeId: string | null
  progress: number
  origin: "scroll" | "pick" | "pane" | "layout"
}
interface CachedPage {
  element: HTMLElement
  layer: HTMLElement
  value: PdfParagraphPage
  overlays: HTMLElement
}
export class PdfParagraphLayer {
  private enabled = false
  private pages = new Map<number, CachedPage>()
  private listeners = new Set<() => void>()
  private observer: MutationObserver
  private frame = 0
  private generation = 0
  private scanVersion = 0
  private destroyed = false
  private paneUntil = 0
  private preferredX: number | null = null
  private unsubscribe?: () => void
  private snapshot: BilingualSnapshot = {
    page: 1,
    paragraphs: [],
    message: "",
    status: "off",
    activeId: null,
    progress: 0,
    origin: "layout",
  }
  constructor(
    private host: HTMLElement,
    private position: () => ViewPosition,
    private seek: (page: number, offset: number) => void,
    private workspace?: PdfWorkspace,
  ) {
    let previous = workspace?.getSnapshot().data.layouts
    this.unsubscribe = workspace?.subscribe(() => {
      const state = workspace.getSnapshot()
      if (!state.ready || state.data.layouts === previous) return
      previous = state.data.layouts
      ++this.generation
      for (const page of this.pages.values()) page.overlays.remove()
      this.pages.clear()
      this.update("layout")
      this.schedule()
    })
    this.observer = new MutationObserver((records) => {
      if (
        records.every(
          (record) =>
            (record.target instanceof Element &&
              record.target.closest(
                ".rf-paragraph-overlays,.rf-study-overlay,.rf-search-overlay,.rf-shape-selection,.rf-pdf-text-notes",
              )) ||
            (record.type === "childList" &&
              [...record.addedNodes, ...record.removedNodes].every(
                (node) =>
                  node instanceof Element &&
                  node.matches(
                    ".rf-paragraph-overlays,.rf-study-overlay,.rf-search-overlay,.rf-shape-selection,.rf-pdf-text-notes",
                  ),
              )),
        )
      )
        return
      this.schedule()
    })
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.snapshot
  changeLayout(paragraphs: PdfParagraph[] | null) {
    const { page, source } = this.snapshot,
      generation = this.generation
    if (!this.workspace || !source || !this.enabled || this.snapshot.status !== "ready")
      return Promise.resolve(false)
    return this.workspace.edit(
      (data) => ({
        ...data,
        layouts: [
          ...data.layouts.filter((p) => p.page !== page),
          ...(paragraphs ? [{ page, source, paragraphs }] : []),
        ],
      }),
      () =>
        this.enabled &&
        !this.destroyed &&
        this.generation === generation &&
        this.position().page === page,
    )
  }
  enable(enabled: boolean) {
    if (this.destroyed || this.enabled === enabled) return
    this.enabled = enabled
    this.generation++
    if (enabled) {
      this.observer.observe(this.host, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-rendered", "data-ocr-loading"],
      })
      this.host.addEventListener("click", this.clicked)
      this.host.addEventListener("wheel", this.intent, { passive: true })
      this.host.addEventListener("pointerdown", this.intent, { passive: true })
      this.host.addEventListener("keydown", this.intent)
      this.update("layout")
      this.schedule()
    } else {
      this.observer.disconnect()
      cancelAnimationFrame(this.frame)
      this.host.removeEventListener("click", this.clicked)
      this.host.removeEventListener("wheel", this.intent)
      this.host.removeEventListener("pointerdown", this.intent)
      this.host.removeEventListener("keydown", this.intent)
      for (const page of this.pages.values()) page.overlays.remove()
      this.pages.clear()
      this.publish({ ...this.snapshot, status: "off", paragraphs: [], activeId: null })
    }
  }
  private intent = (event: Event) => {
    if (
      event.type === "pointerdown" &&
      this.host.dataset.studyTool &&
      this.host.dataset.studyTool !== "select"
    )
      return
    this.paneUntil = 0
  }
  private publish(next: BilingualSnapshot) {
    if (
      next.page === this.snapshot.page &&
      next.paragraphs === this.snapshot.paragraphs &&
      next.status === this.snapshot.status &&
      next.activeId === this.snapshot.activeId &&
      next.progress === this.snapshot.progress &&
      next.origin === this.snapshot.origin &&
      next.message === this.snapshot.message
    )
      return
    this.snapshot = next
    for (const page of this.pages.values())
      for (const box of page.overlays.querySelectorAll<HTMLElement>("[data-paragraph-id]")) {
        const selected = box.dataset.paragraphId === next.activeId
        box.classList.toggle("active", selected)
        if (box instanceof HTMLButtonElement) box.setAttribute("aria-pressed", String(selected))
      }
    this.listeners.forEach((listener) => listener())
  }
  update(origin: BilingualSnapshot["origin"] = "scroll") {
    if (!this.enabled || this.destroyed) return
    const position = this.position(),
      page = this.pages.get(position.page)
    if (position.page !== this.snapshot.page && this.paneUntil <= performance.now())
      this.preferredX = null
    if (!page) {
      this.publish({
        page: position.page,
        paragraphs: [],
        message: "Đang nhận diện đoạn trên trang…",
        status: "loading",
        activeId: null,
        progress: 0,
        origin,
      })
      return
    }
    const hostBox = this.host.getBoundingClientRect(),
      box = page.element.getBoundingClientRect(),
      anchor = (hostBox.top + this.host.clientHeight * 0.15 - box.top) / box.height
    const column =
      this.preferredX === null
        ? []
        : page.value.paragraphs.filter(
            (item) =>
              this.preferredX! >= item.x - 0.01 && this.preferredX! <= item.x + item.width + 0.01,
          )
    // At page/scroll boundaries the requested reading anchor can be unreachable.
    // Preserve the explicit right-pane selection while its programmatic scroll settles.
    const pinned =
      this.paneUntil > performance.now()
        ? page.value.paragraphs.find((item) => item.id === this.snapshot.activeId)
        : undefined
    const active = pinned ?? paragraphAt(column.length ? column : page.value.paragraphs, anchor)
    this.publish({
      ...page.value,
      status: "ready",
      activeId: active?.id ?? null,
      progress: pinned
        ? this.snapshot.progress
        : active
          ? Math.round(Math.max(0, Math.min(1, (anchor - active.y) / active.height)) * 100) / 100
          : 0,
      origin: this.paneUntil > performance.now() ? "pane" : origin,
    })
  }
  select(id: string, scroll = false, progress = 0) {
    const page = [...this.pages.values()].find((item) =>
        item.value.paragraphs.some((paragraph) => paragraph.id === id),
      ),
      paragraph = page?.value.paragraphs.find((item) => item.id === id)
    if (!page || !paragraph) return
    this.preferredX = paragraph.x + paragraph.width / 2
    if (scroll) {
      this.paneUntil = performance.now() + 180
      this.seek(
        paragraph.page,
        Math.max(
          0,
          Math.min(
            1,
            paragraph.y +
              paragraph.height * progress -
              (this.host.clientHeight * 0.15) / page.element.clientHeight,
          ),
        ),
      )
    }
    this.publish({
      ...page.value,
      status: "ready",
      activeId: id,
      progress,
      origin: scroll ? "pane" : "pick",
    })
  }
  private clicked = (event: MouseEvent) => {
    if (
      (this.host.dataset.studyTool && this.host.dataset.studyTool !== "select") ||
      this.host.dataset.annotationEditing === "true" ||
      !(event.target instanceof Element) ||
      event.target.closest("button") ||
      window.getSelection()?.isCollapsed === false
    )
      return
    const element = event.target.closest<HTMLElement>(".rf-pdf-page"),
      page = element ? this.pages.get(Number(element.dataset.page)) : null
    if (!page) return
    const box = page.element.getBoundingClientRect(),
      x = (event.clientX - box.left) / box.width,
      y = (event.clientY - box.top) / box.height
    const paragraph = page.value.paragraphs.find(
      (item) => x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height,
    )
    if (paragraph) this.pick(paragraph)
  }
  private pick(paragraph: PdfParagraph) {
    if (this.position().page !== paragraph.page)
      this.seek(paragraph.page, Math.max(0, paragraph.y - 0.05))
    this.paneUntil = 0
    this.select(paragraph.id)
  }
  private schedule() {
    if (!this.enabled || this.destroyed) return
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => {
      void this.scan()
    })
  }
  private async scan() {
    if (this.workspace && !this.workspace.getSnapshot().ready) return
    const generation = this.generation,
      token = ++this.scanVersion,
      elements = [...this.host.querySelectorAll<HTMLElement>(".rf-pdf-page[data-rendered=true]")]
    const rendered = new Set(elements.map((element) => Number(element.dataset.page)))
    for (const [number, page] of this.pages)
      if (!rendered.has(number)) {
        page.overlays.remove()
        this.pages.delete(number)
      }
    for (const element of elements) {
      if (element.dataset.ocrLoading === "true") {
        this.pages.get(Number(element.dataset.page))?.overlays.remove()
        this.pages.delete(Number(element.dataset.page))
        continue
      }
      const page = Number(element.dataset.page),
        layer =
          element.querySelector<HTMLElement>(".rf-ocr-text") ??
          element.querySelector<HTMLElement>(".textLayer")
      if (!layer || this.pages.get(page)?.layer === layer) continue
      const spans = [...layer.querySelectorAll<HTMLElement>("span")].filter(
          (span) => !span.childElementCount && span.textContent?.trim(),
        ),
        box = element.getBoundingClientRect(),
        items: PdfTextBox[] = []
      let originBox = box
      if (spans.length <= MAX_PDF_TEXT_BOXES)
        for (let i = 0; i < spans.length; i++) {
          const span = spans[i]!,
            rect = span.getBoundingClientRect()
          items.push({
            text: span.textContent ?? "",
            x: rect.left - originBox.left,
            y: rect.top - originBox.top,
            width: rect.width,
            height: rect.height,
            dir: span.dir,
          })
          if (i && i % 250 === 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0))
            originBox = element.getBoundingClientRect()
          }
          if (
            token !== this.scanVersion ||
            generation !== this.generation ||
            !this.enabled ||
            this.destroyed ||
            !layer.isConnected
          )
            return
        }
      let value: PdfParagraphPage =
        spans.length > MAX_PDF_TEXT_BOXES
          ? {
              page,
              paragraphs: [],
              message: "Trang quá nhiều chữ; hãy bôi đen hoặc chụp vùng cần dịch.",
            }
          : extractPdfParagraphs(items, box.width, box.height, page)
      const source = paragraphSource(value.paragraphs),
        saved = this.workspace?.getSnapshot().data.layouts.find((p) => p.page === page)
      value = { ...value, source }
      if (saved?.source === source)
        value = {
          ...value,
          paragraphs: saved.paragraphs,
          message:
            "Đã dùng cách chia đoạn bạn lưu. Vùng tách thủ công được ước lượng; chữ PDF gốc không đổi.",
        }
      else if (saved)
        value = {
          ...value,
          message: "Lớp chữ đã đổi; đang dùng chia đoạn tự động. Bố cục đã lưu cũ vẫn được giữ.",
        }
      const overlays = document.createElement("div")
      overlays.className = "rf-paragraph-overlays"
      for (const paragraph of value.paragraphs) {
        const highlight = document.createElement("div")
        highlight.className = "rf-paragraph-box"
        highlight.classList.toggle("excluded", !!paragraph.excluded)
        highlight.dataset.paragraphId = paragraph.id
        highlight.setAttribute("aria-hidden", "true")
        Object.assign(highlight.style, {
          left: `${paragraph.x * 100}%`,
          top: `${paragraph.y * 100}%`,
          width: `${paragraph.width * 100}%`,
          height: `${paragraph.height * 100}%`,
        })
        const badge = document.createElement("button")
        badge.type = "button"
        badge.className = "rf-paragraph-badge"
        badge.textContent = String(paragraph.index + 1).padStart(2, "0")
        badge.setAttribute("aria-label", `Chọn đoạn ${paragraph.index + 1}, trang ${page}`)
        badge.dataset.paragraphId = paragraph.id
        Object.assign(badge.style, {
          left: `${Math.max(2, paragraph.x * box.width - 27)}px`,
          top: `${paragraph.y * box.height}px`,
        })
        badge.onclick = () => this.pick(paragraph)
        overlays.append(highlight, badge)
      }
      if (
        token !== this.scanVersion ||
        generation !== this.generation ||
        !this.enabled ||
        !layer.isConnected
      )
        return
      this.pages.get(page)?.overlays.remove()
      element.append(overlays)
      this.pages.set(page, { element, layer, overlays, value })
    }
    this.update("layout")
  }
  destroy() {
    this.unsubscribe?.()
    this.enable(false)
    this.destroyed = true
    this.listeners.clear()
  }
}
