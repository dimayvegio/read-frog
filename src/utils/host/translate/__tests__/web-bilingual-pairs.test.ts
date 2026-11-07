// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { WebBilingualPairs } from "../web-bilingual-pairs"

afterEach(() => {
  document.body.replaceChildren()
  history.replaceState({}, "", "/")
})
const make = (html = "An <strong>important</strong> paragraph.") => {
  const element = document.createElement("p")
  element.innerHTML = html
  document.body.append(element)
  return element
}
it("captures original inline text and only exposes committed pairs, with no DOM rewriting", () => {
  const store = new WebBilingualPairs(),
    element = make("One<strong> word</strong> <em>at a time.</em>"),
    capture = store.capture([element]),
    markup = element.innerHTML
  expect(store.getSnapshot().rows).toEqual([])
  const output = document.createElement("span")
  output.textContent = "Mỗi lần một từ."
  element.append(output)
  store.commit(capture, output, element, output.textContent, DEFAULT_CONFIG)
  expect(store.getSnapshot().rows[0]?.original).toBe("One word at a time.")
  expect(element.innerHTML).toBe(markup + "<span>Mỗi lần một từ.</span>")
  expect(store.getSnapshot().rows[0]?.translation).toBe("Mỗi lần một từ.")
  store.commit(capture, output, element, output.textContent, DEFAULT_CONFIG)
  expect(store.getSnapshot().rows).toHaveLength(1)
  output.textContent = "Host changed the output"
  store.prune()
  expect(store.getSnapshot().rows).toHaveLength(0)
})
it("represents in-place swaps using the original capture and prunes when originals are restored", () => {
  const store = new WebBilingualPairs(),
    element = make("An original sentence."),
    capture = store.capture([element])
  element.firstChild!.textContent = "Một câu gốc."
  store.commit(capture, element, element, "Một câu gốc.", DEFAULT_CONFIG, { swapped: true })
  expect(store.getSnapshot().rows[0]?.original).toBe("An original sentence.")
  element.firstChild!.textContent = "An original sentence."
  store.prune()
  expect(store.getSnapshot().rows).toEqual([])
})
it("ignores detached, cancelled, late-route and interactive-field results", () => {
  const store = new WebBilingualPairs(),
    element = make(),
    capture = store.capture([element])
  store.clear()
  store.commit(capture, element, element, "Late", DEFAULT_CONFIG)
  expect(store.getSnapshot().rows).toEqual([])
  const next = store.capture([element])
  history.pushState({}, "", "/different-story")
  store.commit(next, element, element, "Wrong route", DEFAULT_CONFIG)
  expect(store.getSnapshot().rows).toEqual([])
  const form = document.createElement("form")
  document.body.append(form)
  form.append(element)
  store.commit(store.capture([element]), element, element, "Form data", DEFAULT_CONFIG)
  expect(store.getSnapshot().rows).toEqual([])
  element.remove()
  store.commit(store.capture([element]), element, element, "Detached", DEFAULT_CONFIG)
  expect(store.getSnapshot().rows).toEqual([])
})
it("keeps document order, survives a moved live node, and bounds retained pairs", () => {
  const store = new WebBilingualPairs(),
    first = make("First"),
    second = make("Second")
  store.commit(store.capture([second]), second, second, "Hai", DEFAULT_CONFIG)
  store.commit(store.capture([first]), first, first, "Một", DEFAULT_CONFIG)
  expect(store.getSnapshot().rows.map((row) => row.original)).toEqual(["First", "Second"])
  document.body.insertBefore(second, first)
  store.prune()
  expect(store.getSnapshot().rows.map((row) => row.original)).toEqual(["Second", "First"])
  for (let index = 0; index < 410; index++) {
    const element = make(`Paragraph ${index}`)
    store.commit(store.capture([element]), element, element, `Đoạn ${index}`, DEFAULT_CONFIG)
  }
  expect(store.getSnapshot().rows).toHaveLength(400)
  expect(store.getSnapshot().limited).toBe(true)
  document.body.replaceChildren()
  store.prune()
  expect(store.getSnapshot().rows).toEqual([])
})
it("does not retain fallback originals or use the URL fragment as a new article", () => {
  const store = new WebBilingualPairs(),
    original = make(),
    capture = store.capture([original]),
    output = make("Bản dịch")
  original.remove()
  store.commit(capture, output, output, "Bản dịch", DEFAULT_CONFIG, { detachedSource: true })
  expect(store.getSnapshot().rows).toHaveLength(1)
  history.replaceState({}, "", "#paragraph-2")
  store.prune()
  expect(store.getSnapshot().rows).toHaveLength(1)
  output.remove()
  store.prune()
  expect(store.getSnapshot().rows).toEqual([])
})
it("rejects a source rewritten during a request and safely omits oversized paragraphs", () => {
  const store = new WebBilingualPairs(),
    element = make("Source before the request."),
    capture = store.capture([element])
  element.firstChild!.textContent = "A different story after a live update."
  const output = document.createElement("span")
  output.textContent = "Stale translation"
  element.append(output)
  store.commit(capture, output, element, output.textContent, DEFAULT_CONFIG)
  expect(store.getSnapshot().rows).toEqual([])
  const large = make("a".repeat(20001))
  store.commit(store.capture([large]), large, large, "Bản dịch", DEFAULT_CONFIG)
  expect(store.getSnapshot().rows).toEqual([])
  expect(store.getSnapshot().limited).toBe(true)
})
it("rebinds a carried wrapper to an identical replacement source without losing the pair", () => {
  const store = new WebBilingualPairs(),
    previous = make("English source."),
    capture = store.capture([previous]),
    wrapper = document.createElement("span"),
    output = document.createElement("span")
  wrapper.className = "read-frog-translated-content-wrapper"
  output.textContent = "Bản dịch"
  wrapper.append(output)
  previous.append(wrapper)
  store.commit(capture, output, previous, "Bản dịch", DEFAULT_CONFIG)
  const id = store.getSnapshot().rows[0]!.id,
    next = make("English source.")
  previous.remove()
  next.append(wrapper)
  store.rebind(previous, next)
  store.prune()
  expect(store.getSnapshot().rows[0]?.id).toBe(id)
  expect(store.anchor(id)).toBe(next)
})
