import { browser } from "#imports"
import { readStudySnapshot, STUDY_HIGHLIGHT_KEY, studyHighlightsEnabled } from "./study-client"
import { createStudyMatcher, STUDY_LABELS } from "./study-matcher"

/** Custom Highlight ranges decorate text without rewriting the site's DOM. */
export function startStudyHighlights(root: HTMLElement, signal: AbortSignal) {
  if (!("Highlight" in globalThis) || !CSS.highlights) return
  const names = Object.keys(STUDY_LABELS).map((key) => `rf-study-${key}`)
  const style = document.createElement("style")
  style.textContent = `::highlight(rf-study-needsReview){background:#fecaca;color:#651a1a}::highlight(rf-study-developing){background:#fef08a;color:#493700}::highlight(rf-study-notAssessed){background:#dbeafe;color:#17375c}::highlight(rf-study-recallSignals){text-decoration:underline #22a06b 2px}`
  const pdf = root.matches(".rf-pdf-scroll")
  const excluded =
    'script,style,textarea,input,select,button,a,code,pre,[hidden],[aria-hidden="true"],[contenteditable]:not([contenteditable="false"]),[data-rf-study-popup],.read-frog-translated-content-wrapper'
  if (pdf) {
    // PDF glyphs live on the canvas below this transparent text layer. Opaque
    // highlight paint would cover the word rather than tint it.
    const colors = ["#ef444433", "#eab30833", "#3b82f633", "#22a06b22"]
    style.textContent += names
      .map((name, index) => `::highlight(${name}){color:transparent;background:${colors[index]}}`)
      .join("")
  }
  document.head.append(style)
  let enabled = true,
    stopped = false,
    timer: ReturnType<typeof setTimeout> | undefined
  let matcher = createStudyMatcher([]),
    hasWords = false
  let current: { range: Range; match: ReturnType<typeof matcher>[number] }[] = []
  let popup: HTMLElement | null = null
  const clear = () => {
    for (const name of names) CSS.highlights.delete(name)
    current = []
  }
  const scan = () => {
    if (stopped || document.hidden) return
    clear()
    if (!enabled || !hasWords) return
    const groups = new Map<string, Range[]>()
    const scopes: HTMLElement[] = pdf ? [...root.querySelectorAll<HTMLElement>(".textLayer")] : []
    if (!pdf) {
      // Seed visible blocks before the fallback walk. A long list scrolled to
      // its end must not need an unbounded scan through all earlier siblings.
      for (let y = 60; y < innerHeight; y += 180)
        for (let x = 80; x < innerWidth; x += 300) {
          const block = document
            .elementFromPoint(x, y)
            ?.closest<HTMLElement>("p,li,h1,h2,h3,h4,blockquote,td,dd,dt")
          if (block && root.contains(block) && !block.closest(excluded) && !scopes.includes(block))
            scopes.push(block)
        }
      scopes.push(root)
    }
    const seen = new WeakSet<Node>(),
      started = performance.now()
    let visited = 0,
      count = 0,
      chars = 0
    for (const scope of scopes) {
      let node: Node | null = scope
      while (
        node &&
        visited++ < 5000 &&
        count < 500 &&
        chars < 100000 &&
        current.length < 500 &&
        performance.now() - started < 20
      ) {
        let descend = true
        if (node instanceof Element) {
          const rect = node.getBoundingClientRect()
          descend = !node.matches(excluded) && rect.bottom >= -200 && rect.top <= innerHeight + 200
        } else if (node.nodeType === Node.TEXT_NODE && !seen.has(node)) {
          seen.add(node)
          count++
          const text = node.textContent ?? ""
          chars += text.length
          if (
            text.trim() &&
            text.length <= 6000 &&
            node.parentElement &&
            getComputedStyle(node.parentElement).visibility !== "hidden"
          )
            for (const match of matcher(text, 500 - current.length)) {
              const range = new Range()
              range.setStart(node, match.start)
              range.setEnd(node, match.end)
              const list = groups.get(match.status) ?? []
              list.push(range)
              groups.set(match.status, list)
              current.push({ range, match })
            }
        }
        if (descend && node.firstChild) {
          node = node.firstChild
          continue
        }
        while (node && node !== scope && !node.nextSibling) node = node.parentNode
        node = node === scope ? null : (node?.nextSibling ?? null)
      }
    }
    for (const [status, ranges] of groups)
      CSS.highlights.set(`rf-study-${status}`, new Highlight(...ranges))
  }
  const schedule = () => {
    if (stopped || timer) return
    timer = setTimeout(() => {
      timer = undefined
      scan()
    }, 150)
  }
  const refresh = async () => {
    try {
      const active = await studyHighlightsEnabled()
      if (stopped) return
      enabled = active
      if (!active) {
        hasWords = false
        clear()
        popup?.remove()
        popup = null
        return
      }
      const snapshot = await readStudySnapshot(true)
      if (stopped) return
      matcher = createStudyMatcher(snapshot.words)
      hasWords = snapshot.words.length > 0
      schedule()
    } catch {
      if (!stopped) clear()
    }
  }
  const click = (event: MouseEvent) => {
    if (
      !enabled ||
      getSelection()?.toString() ||
      event.button !== 0 ||
      !(event.target instanceof Element) ||
      event.target.closest("a,button,input,textarea,[contenteditable], [data-rf-study-popup]")
    )
      return
    const hit = current.find(({ range }) =>
      [...range.getClientRects()].some(
        (rect) =>
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom,
      ),
    )
    popup?.remove()
    popup = null
    if (!hit) return
    popup = document.createElement("div")
    popup.dataset.rfStudyPopup = "true"
    popup.style.cssText = `position:fixed;z-index:2147483647;left:${Math.max(8, Math.min(innerWidth - 330, event.clientX))}px;top:${Math.max(8, Math.min(innerHeight - 240, event.clientY + 12))}px;width:min(310px,calc(100vw - 16px));max-height:230px;overflow:auto`
    const shadow = popup.attachShadow({ mode: "open" }),
      box = document.createElement("div")
    box.style.cssText =
      "font:14px/1.5 system-ui;background:#171717;color:#fff;padding:14px;border:1px solid #777;border-radius:12px;box-shadow:0 6px 24px #0005"
    for (const word of hit.match.words.slice(0, 8)) {
      const heading = document.createElement("strong")
      heading.textContent = `${word.word} — ${word.meaning}`
      const detail = document.createElement("p")
      detail.textContent = `${STUDY_LABELS[word.status]}. ${word.reason}${word.lastAt ? ` Lần kiểm tra gần nhất: ${new Date(word.lastAt).toLocaleDateString("vi-VN")}.` : ""}`
      const context = document.createElement("p")
      context.textContent = word.context
      box.append(heading, detail, context)
    }
    const close = document.createElement("button")
    close.textContent = "Đóng"
    close.onclick = () => {
      popup?.remove()
      popup = null
    }
    box.append(close)
    shadow.append(box)
    document.body.append(popup)
  }
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          !(record.target instanceof Element && record.target.closest("[data-rf-study-popup]")),
      )
    )
      schedule()
  })
  observer.observe(root, { subtree: true, childList: true, characterData: true })
  const visibility = () => {
    if (!document.hidden) void refresh()
  }
  window.addEventListener("scroll", schedule, { passive: true, capture: true })
  window.addEventListener("resize", schedule)
  window.addEventListener("focus", visibility)
  document.addEventListener("visibilitychange", visibility)
  root.addEventListener("click", click)
  const changed = (changes: Record<string, unknown>) => {
    if (STUDY_HIGHLIGHT_KEY in changes || "vocabularyStudyRevision" in changes) void refresh()
  }
  browser.storage.onChanged.addListener(changed)
  const poll = setInterval(() => {
    if (!document.hidden) void refresh()
  }, 30000)
  signal.addEventListener(
    "abort",
    () => {
      stopped = true
      clearTimeout(timer)
      clearInterval(poll)
      observer.disconnect()
      clear()
      style.remove()
      popup?.remove()
      window.removeEventListener("scroll", schedule, true)
      window.removeEventListener("resize", schedule)
      window.removeEventListener("focus", visibility)
      document.removeEventListener("visibilitychange", visibility)
      root.removeEventListener("click", click)
      browser.storage.onChanged.removeListener(changed)
    },
    { once: true },
  )
  void refresh()
}
