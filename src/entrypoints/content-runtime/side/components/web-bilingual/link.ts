import { webBilingualPairs as pairs } from "@/utils/host/translate/web-bilingual-pairs"

export class WebBilingualLink {
  private visible = new Set<string>()
  private observed = new Map<Element, Set<string>>()
  private observer: IntersectionObserver
  private frame = 0
  private sync = true
  private selected: string | null = null
  private mutedPageUntil = 0
  private mutedPaneUntil = 0
  private paneUserUntil = 0
  private disposed = false
  private unsubscribe: () => void
  constructor(
    private root: HTMLElement,
    private pane: HTMLElement,
    private overlay: HTMLElement,
    private active: (id: string | null) => void,
  ) {
    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries)
        for (const id of this.observed.get(entry.target) ?? []) {
          if (entry.isIntersecting) this.visible.add(id)
          else this.visible.delete(id)
        }
      this.schedule()
    })
    this.unsubscribe = pairs.subscribe(() => this.refresh())
    this.refresh()
    window.addEventListener("scroll", this.pageScrolled, { passive: true, capture: true })
    window.addEventListener("resize", this.schedule)
    window.addEventListener("wheel", this.intent, { passive: true, capture: true })
    window.addEventListener("pointerdown", this.intent, { passive: true, capture: true })
    document.addEventListener("click", this.pageClicked)
    pane.addEventListener("scroll", this.paneScrolled, { passive: true })
    pane.addEventListener("wheel", this.paneIntent, { passive: true })
    pane.addEventListener("pointerdown", this.paneIntent, { passive: true })
    pane.addEventListener("keydown", this.paneIntent)
  }
  setSync(value: boolean) {
    this.sync = value
    if (value) this.schedule()
  }
  private isUI(event: Event) {
    return event.composedPath().includes(this.root.getRootNode())
  }
  private intent = (event: Event) => {
    if (!this.isUI(event)) this.mutedPageUntil = 0
  }
  private paneIntent = () => {
    this.paneUserUntil = performance.now() + 1500
    this.mutedPaneUntil = 0
  }
  private refresh() {
    const next = new Map<Element, Set<string>>()
    for (const row of pairs.getSnapshot().rows) {
      const node = pairs.anchor(row.id),
        element = node instanceof Element ? node : node?.parentElement
      if (element) {
        const ids = next.get(element) ?? new Set<string>()
        ids.add(row.id)
        next.set(element, ids)
      }
    }
    for (const element of this.observed.keys())
      if (!next.has(element)) this.observer.unobserve(element)
    for (const element of next.keys())
      if (!this.observed.has(element)) this.observer.observe(element)
    const ids = new Set(pairs.getSnapshot().rows.map((row) => row.id))
    this.visible = new Set([...this.visible].filter((id) => ids.has(id)))
    this.observed = next
    if (this.selected && !ids.has(this.selected)) this.choose(null)
    this.schedule()
  }
  private choose(id: string | null) {
    if (id !== this.selected) {
      this.selected = id
      this.active(id)
    }
  }
  private card(id: string) {
    return this.pane.querySelector<HTMLElement>(`[data-web-pair="${id}"]`)
  }
  private alignPane(id: string, progress: number) {
    const node = this.card(id)
    if (!node) return
    this.mutedPaneUntil = performance.now() + 200
    this.pane.scrollTop =
      node.offsetTop + progress * node.offsetHeight - this.pane.clientHeight * 0.18
  }
  private pageScrolled = (event: Event) => {
    if (!this.isUI(event)) this.schedule()
  }
  private schedule = () => {
    if (this.disposed || this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.update()
    })
  }
  private update() {
    const line = Math.max(80, innerHeight * 0.22)
    if (performance.now() >= this.mutedPageUntil) {
      let closest: { id: string; distance: number; progress: number } | null = null
      for (const id of this.visible) {
        const rect = pairs.rect(id)
        if (
          !rect ||
          rect.bottom < 0 ||
          rect.top > innerHeight ||
          rect.width <= 0 ||
          rect.height <= 0
        )
          continue
        const distance =
          line < rect.top ? rect.top - line : line > rect.bottom ? line - rect.bottom : 0
        if (!closest || distance < closest.distance)
          closest = {
            id,
            distance,
            progress: Math.max(0, Math.min(1, (line - rect.top) / rect.height)),
          }
      }
      if (closest) {
        this.choose(closest.id)
        if (this.sync) this.alignPane(closest.id, closest.progress)
      }
    }
    this.paint()
  }
  private paint() {
    const rect = this.selected ? pairs.rect(this.selected) : null
    if (!rect || rect.bottom < 0 || rect.top > innerHeight || !rect.width || !rect.height) {
      this.overlay.hidden = true
      return
    }
    this.overlay.hidden = false
    Object.assign(this.overlay.style, {
      left: `${rect.left - 3}px`,
      top: `${rect.top - 3}px`,
      width: `${rect.width + 6}px`,
      height: `${rect.height + 6}px`,
    })
  }
  select(id: string, fromPane: boolean, progress = 0, explicit = true) {
    pairs.prune()
    const rect = pairs.rect(id),
      anchor = pairs.anchor(id)
    if (!rect || !anchor) return
    this.choose(id)
    this.mutedPageUntil = performance.now() + 250
    if (fromPane) {
      if (explicit) this.alignPane(id, progress)
      let parent = anchor instanceof Element ? anchor.parentElement : anchor.parentElement,
        scroller: HTMLElement | null = null
      for (let count = 0; parent && count < 30; parent = parent.parentElement, count++) {
        if (
          parent instanceof HTMLElement &&
          parent.scrollHeight > parent.clientHeight + 2 &&
          /auto|scroll/.test(getComputedStyle(parent).overflowY)
        ) {
          scroller = parent
          break
        }
      }
      const line = scroller
        ? Math.max(0, scroller.getBoundingClientRect().top) +
          Math.min(scroller.clientHeight, innerHeight) * 0.22
        : Math.max(80, innerHeight * 0.22)
      const delta = rect.top + rect.height * progress - line
      if (scroller) scroller.scrollTop += delta
      else window.scrollBy({ top: delta, behavior: "instant" })
    } else this.alignPane(id, progress)
    this.schedule()
  }
  private pageClicked = (event: MouseEvent) => {
    if (this.isUI(event) || window.getSelection()?.isCollapsed === false || event.button !== 0)
      return
    for (const id of this.visible) {
      const rect = pairs.rect(id)
      if (
        rect &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      ) {
        this.select(id, false)
        break
      }
    }
  }
  private paneScrolled = () => {
    if (
      !this.sync ||
      performance.now() < this.mutedPaneUntil ||
      performance.now() > this.paneUserUntil
    )
      return
    const line = this.pane.scrollTop + this.pane.clientHeight * 0.18
    const cards = [...this.pane.querySelectorAll<HTMLElement>("[data-web-pair]")]
    const card = cards.find(
      (node) => line >= node.offsetTop && line < node.offsetTop + node.offsetHeight,
    )
    if (card)
      this.select(
        card.dataset.webPair!,
        true,
        Math.max(0, Math.min(1, (line - card.offsetTop) / card.offsetHeight)),
        false,
      )
  }
  destroy() {
    this.disposed = true
    this.unsubscribe()
    this.observer.disconnect()
    cancelAnimationFrame(this.frame)
    window.removeEventListener("scroll", this.pageScrolled, true)
    window.removeEventListener("resize", this.schedule)
    window.removeEventListener("wheel", this.intent, true)
    window.removeEventListener("pointerdown", this.intent, true)
    document.removeEventListener("click", this.pageClicked)
    this.pane.removeEventListener("scroll", this.paneScrolled)
    this.pane.removeEventListener("wheel", this.paneIntent)
    this.pane.removeEventListener("pointerdown", this.paneIntent)
    this.pane.removeEventListener("keydown", this.paneIntent)
    this.overlay.hidden = true
  }
}
