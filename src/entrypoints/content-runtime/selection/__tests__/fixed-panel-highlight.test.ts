// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { clearFixedPanelHighlight, showFixedPanelHighlight } from "../fixed-panel-highlight"
import { createRangeSnapshot } from "../utils"
const registry = new Map()
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("CSS", { highlights: registry })
  vi.stubGlobal(
    "Highlight",
    class {
      ranges: Range[]
      constructor(...ranges: Range[]) {
        this.ranges = ranges
      }
    },
  )
  vi.stubGlobal(
    "CSSStyleSheet",
    class {
      replaceSync(_value: string) {}
    },
  )
  Object.defineProperty(document, "adoptedStyleSheets", {
    configurable: true,
    writable: true,
    value: [],
  })
  document.body.innerHTML =
    '<p id="first">First <a href="#">article</a> paragraph.</p><p id="second">Second paragraph.</p>'
})
afterEach(() => {
  clearFixedPanelHighlight()
  registry.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
const snapshot = (id: string) => {
  const node = document.getElementById(id)!,
    range = document.createRange()
  range.selectNodeContents(node)
  return { text: range.toString(), ranges: [createRangeSnapshot(range)] }
}
it("paints one selected paragraph without changing source HTML, links or native selection", () => {
  const html = document.body.innerHTML,
    selected = window.getSelection()!.toString()
  expect(showFixedPanelHighlight(snapshot("first"), "First article paragraph.")).toBe(true)
  expect(registry.size).toBe(1)
  expect(document.adoptedStyleSheets.length).toBe(1)
  expect(document.body.innerHTML).toBe(html)
  expect(window.getSelection()!.toString()).toBe(selected)
  expect(showFixedPanelHighlight(snapshot("second"), "Second paragraph.")).toBe(true)
  expect(registry.size).toBe(1)
  expect(document.adoptedStyleSheets.length).toBe(1)
  clearFixedPanelHighlight()
  expect(registry.size).toBe(0)
  expect(document.adoptedStyleSheets.length).toBe(0)
})
it("rejects mismatched text and drops a removed source instead of highlighting different content", async () => {
  expect(showFixedPanelHighlight(snapshot("first"), "Wrong text")).toBe(false)
  const old = snapshot("first")
  document.getElementById("first")!.firstChild!.textContent = "Third "
  expect(showFixedPanelHighlight(old, "First article paragraph.")).toBe(false)
  document.getElementById("first")!.firstChild!.textContent = "First "
  showFixedPanelHighlight(snapshot("first"), "First article paragraph.")
  document.getElementById("first")!.remove()
  await vi.advanceTimersByTimeAsync(1000)
  expect(registry.size).toBe(0)
})
