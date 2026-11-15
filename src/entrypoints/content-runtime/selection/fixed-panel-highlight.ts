import type { SelectionSnapshot } from "./utils"
import { normalizeSelectedText, toLiveRange } from "./utils"

const NAME = "flowread-fixed-selection-v1"
let dispose: (() => void) | undefined
export function clearFixedPanelHighlight() {
  dispose?.()
  dispose = undefined
}
const normalized = (s: string) => normalizeSelectedText(s).replace(/\s+/gu, " ")
/** Native paint-only highlight: no wrappers, text replacement, layout or provider calls. */
export function showFixedPanelHighlight(snapshot: SelectionSnapshot, text: string) {
  clearFixedPanelHighlight()
  if (
    !text ||
    text.length > 20000 ||
    snapshot.textControl ||
    snapshot.ranges.length > 32 ||
    normalized(snapshot.text) !== normalized(text) ||
    !globalThis.CSS?.highlights ||
    typeof Highlight === "undefined" ||
    !document.adoptedStyleSheets
  )
    return false
  try {
    const ranges = snapshot.ranges.map(toLiveRange)
    if (
      !ranges.length ||
      ranges.some((r) => !r.startContainer.isConnected || !r.endContainer.isConnected)
    )
      return false
    const value = new Highlight(...ranges),
      sheet = new CSSStyleSheet(),
      route = location.href
    const original = ranges.map((r) => r.toString()).join("\n")
    if (
      original.length > 40000 ||
      normalized(original).replace(/\s/gu, "") !== normalized(text).replace(/\s/gu, "")
    )
      return false
    sheet.replaceSync(
      `::highlight(${NAME}){background-color:#ffe08a;text-decoration:underline #c48700} @media print{::highlight(${NAME}){background-color:transparent;text-decoration:none}}`,
    )
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
    CSS.highlights.set(NAME, value)
    const clean = () => {
      clearInterval(timer)
      window.removeEventListener("pagehide", clearFixedPanelHighlight)
      if (CSS.highlights.get(NAME) === value) CSS.highlights.delete(NAME)
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet)
    }
    const timer = setInterval(() => {
      if (
        location.href !== route ||
        ranges.some((r) => !r.startContainer.isConnected || !r.endContainer.isConnected) ||
        ranges.map((r) => r.toString()).join("\n") !== original
      )
        clearFixedPanelHighlight()
    }, 1000)
    dispose = clean
    window.addEventListener("pagehide", clearFixedPanelHighlight, { once: true })
    return true
  } catch {
    return false
  }
}
