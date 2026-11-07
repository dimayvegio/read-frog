import { beforeEach, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { setupPdfReaderHandlers } from "../pdf-reader"
const { handlers, load, save, forget } = vi.hoisted(() => ({
  handlers: new Map<string, (message: any) => any>(),
  load: vi.fn<(...args: any[]) => any>(),
  save: vi.fn<(...args: any[]) => any>(),
  forget: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("@/utils/message", () => ({
  onMessage: (name: string, fn: (message: any) => any) => handlers.set(name, fn),
}))
vi.mock("@/utils/selection-result/reading-position-db", () => ({
  getPdfReadingPosition: load,
  savePdfReadingPosition: save,
  forgetPdfReadingPosition: forget,
}))
const sender = (page = "pdf-reader.html") => ({
  id: browser.runtime.id,
  url: browser.runtime.getURL("/") + page,
  frameId: 0,
})
const call = (name: string, data: any, from = sender()) =>
  handlers.get(name)!({ data, sender: from })
beforeEach(async () => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  handlers.clear()
  await browser.storage.session.clear()
  setupPdfReaderHandlers()
  vi.spyOn(browser.tabs, "query").mockResolvedValue([
    { id: 12, url: "file:///C:/private/book.pdf" },
  ] as any)
  vi.spyOn(browser.tabs, "get").mockResolvedValue({
    id: 12,
    url: "file:///C:/private/book.pdf",
  } as any)
  vi.spyOn(browser.tabs, "create").mockResolvedValue({ id: 13 } as any)
})
it("rejects websites, content frames and other extension pages before accessing reading data", () => {
  for (const from of [
    { ...sender(), id: "foreign" },
    { ...sender(), frameId: 2 },
    { ...sender(), url: "https://example.com/pdf-reader.html" },
    sender("options.html"),
  ])
    expect(() => call("loadPdfReadingPosition", { documentId: "x" }, from)).toThrow(
      "requires the Read Frog PDF reader",
    )
  expect(load).not.toHaveBeenCalled()
})
it("opens a local source through an opaque channel with no path stored in session", async () => {
  await call("openPdfReader", { windowId: 3 }, sender("sidepanel.html"))
  const session = await browser.storage.session.get(null),
    key = Object.keys(session)[0]!
  expect(JSON.stringify(session)).not.toMatch(/file:|private|book.pdf/)
  const channel = key.split(":")[1]
  expect(await call("getPdfReaderSource", { channel })).toMatchObject({
    url: "file:///C:/private/book.pdf",
    document: { title: "book.pdf" },
  })
  vi.spyOn(browser.tabs, "get").mockResolvedValue({ id: 12, url: "file:///C:/other.pdf" } as any)
  expect(await call("getPdfReaderSource", { channel })).toBeNull()
})
it("does not automatically fetch web URLs and expires local source channels", async () => {
  vi.spyOn(browser.tabs, "query").mockResolvedValue([
    { id: 12, url: "https://example.com/book.pdf" },
  ] as any)
  await call("openPdfReader", { windowId: 3 }, sender("popup.html"))
  expect(await browser.storage.session.get(null)).toEqual({})
  const channel = crypto.randomUUID()
  await browser.storage.session.set({
    [`pdf-reader-source:${channel}`]: {
      tabId: 12,
      documentId: "x",
      createdAt: Date.now() - 31 * 60 * 1000,
    },
  })
  expect(await call("getPdfReaderSource", { channel })).toBeNull()
})
