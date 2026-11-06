import { beforeEach, describe, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { NATIVE_SELECTION_TTL_MS } from "@/types/native-selection"
import { openNativePdfPanel, setupNativePanelHandlers, isPdfContext } from "../native-panel"
const { open, popup, handlers, getApi } = vi.hoisted(() => ({
  open: vi.fn<(...args: any[]) => any>(),
  popup: vi.fn<(...args: any[]) => any>(),
  handlers: new Map<string, (...args: any[]) => any>(),
  getApi: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("../side-panel", () => ({ getSidePanelApi: getApi }))
vi.mock("../native-selection", () => ({ openNativeSelectionResult: popup }))
vi.mock("@/utils/message", () => ({
  onMessage: (name: string, fn: (...args: any[]) => any) => handlers.set(name, fn),
}))
const removed: Array<(id: number) => void> = []
const focused: Array<(id: number) => void> = []
const tab = { id: 12, windowId: 3, url: "file:///C:/private/book.pdf", title: "Book" } as any
const info = { menuItemId: "read-frog-pdf-panel", pageUrl: tab.url } as any
const read = (windowId = 3, url = browser.runtime.getURL("/sidepanel.html")) =>
  handlers.get("getNativePanelSelection")!({
    data: { windowId },
    sender: { id: browser.runtime.id, url, frameId: 0 },
  })
beforeEach(async () => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  removed.length = 0
  focused.length = 0
  handlers.clear()
  await browser.storage.session.clear()
  getApi.mockReturnValue({ kind: "chromium-side-panel", api: { open } })
  open.mockResolvedValue(undefined)
  popup.mockResolvedValue(undefined)
  vi.spyOn(browser.tabs, "query").mockImplementation(async () => [tab])
  vi.spyOn(browser.tabs, "get").mockImplementation(async () => tab)
  vi.spyOn(browser.windows.onRemoved, "addListener").mockImplementation((listener) =>
    removed.push(listener),
  )
  vi.spyOn(browser.windows.onFocusChanged, "addListener").mockImplementation((listener) => {
    focused.push(listener)
  })
  setupNativePanelHandlers()
})
describe("native PDF side panel lifecycle", () => {
  it("invokes the panel synchronously in the menu's user gesture and sends only an opaque document ID", async () => {
    const task = openNativePdfPanel("Paragraph", info, tab)
    expect(open).toHaveBeenCalledExactlyOnceWith({ windowId: 3 })
    expect(browser.tabs.get).not.toHaveBeenCalled()
    await task
    expect(await read()).toMatchObject({
      text: "Paragraph",
      document: { id: expect.stringMatching(/^[a-f0-9]{64}$/), title: "book.pdf" },
    })
    expect(JSON.stringify(await browser.storage.session.get(null))).not.toMatch(/file:|private|C:/)
    expect(popup).not.toHaveBeenCalled()
  })
  it("updates the same panel without leaking a previous document's current selection", async () => {
    await openNativePdfPanel("First", info, tab)
    const first = await read()
    await openNativePdfPanel("Second", { ...info, pageUrl: "file:///C:/private/second.pdf" }, tab)
    const second = await read()
    expect(second.text).toBe("Second")
    expect(second.document.id).not.toBe(first.document.id)
    const stored = await browser.storage.session.get(null)
    expect(Object.keys(stored).filter((key) => key.startsWith("native-selection:"))).toHaveLength(1)
  })
  it("keeps panels in different browser windows independent", async () => {
    await Promise.all([
      openNativePdfPanel("A", info, tab),
      openNativePdfPanel("B", info, { ...tab, windowId: 4 }),
    ])
    expect((await read(3)).text).toBe("A")
    expect((await read(4)).text).toBe("B")
  })
  it("resolves guest tab -1 without a content script or local PDF upload", async () => {
    await openNativePdfPanel("Guest selection", info, { id: -1, windowId: 3 } as any)
    expect(browser.tabs.query).toHaveBeenCalledExactlyOnceWith({ active: true, windowId: 3 })
    expect((await read()).document.title).toBe("book.pdf")
  })
  it.each(["unsupported", "gesture rejected"])(
    "falls back to the existing popup when %s",
    async (reason) => {
      if (reason === "unsupported") getApi.mockReturnValue(null)
      else open.mockRejectedValueOnce(new Error("user gesture required"))
      await openNativePdfPanel("Paragraph", info, tab)
      expect(popup).toHaveBeenCalledExactlyOnceWith("Paragraph", 12, {
        id: expect.any(String),
        title: "book.pdf",
      })
      expect(await read()).toBeNull()
    },
  )
  it("handles a missing window via the popup", async () => {
    await openNativePdfPanel("Paragraph", info)
    expect(open).not.toHaveBeenCalled()
    expect(popup).toHaveBeenCalledOnce()
  })
  it("uses the known focused browser window for a native guest menu without tab metadata", async () => {
    focused[0]!(3)
    await openNativePdfPanel("Guest paragraph", info)
    expect(open).toHaveBeenCalledExactlyOnceWith({ windowId: 3 })
    expect((await read()).text).toBe("Guest paragraph")
    expect(popup).not.toHaveBeenCalled()
  })
  it("rejects content scripts and unrelated extension pages", async () => {
    await openNativePdfPanel("Private paragraph", info, tab)
    for (const url of [
      "https://example.com/sidepanel.html",
      browser.runtime.getURL("/options.html"),
    ])
      await expect(read(3, url)).rejects.toThrow("PDF side panel")
    await expect(read(-1)).rejects.toThrow("Invalid panel window")
  })
  it("expires ephemeral text and clears it when the browser window closes", async () => {
    await openNativePdfPanel("A", info, tab)
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + NATIVE_SELECTION_TTL_MS + 1)
    expect(await read()).toBeNull()
    clock.mockRestore()
    await openNativePdfPanel("B", info, tab)
    removed[0]!(3)
    await vi.waitFor(async () => expect(await browser.storage.session.get(null)).toEqual({}))
  })
  it("does not leave a selection for a source tab that closed while opening", async () => {
    vi.mocked(browser.tabs.get).mockRejectedValueOnce(new Error("closed"))
    await openNativePdfPanel("A", info, tab)
    expect(await read()).toBeNull()
  })
  it("does not store oversized text or open anything for an empty selection", async () => {
    await openNativePdfPanel(" ", info, tab)
    expect(open).not.toHaveBeenCalled()
    await openNativePdfPanel("x".repeat(20001), info, tab)
    expect(await read()).toMatchObject({ text: "", tooLong: true })
  })
  it("only recognizes actual PDF pathname suffixes", () => {
    expect(isPdfContext({ ...info, pageUrl: "file:///book.pdf#page=3" })).toBe(true)
    expect(isPdfContext({ ...info, pageUrl: "https://example.com/news?file=book.pdf" })).toBe(false)
  })
})
