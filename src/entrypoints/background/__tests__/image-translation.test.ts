import { beforeEach, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { setupImageTranslationHandlers, IMAGE_CAPTURE_TTL } from "../image-translation"
const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (message: any) => any>() }))
vi.mock("@/utils/message", () => ({
  onMessage: (name: string, fn: (message: any) => any) => handlers.set(name, fn),
}))
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ7sAAAAASUVORK5CYII="
const sender = (page = "popup.html") => ({
  id: browser.runtime.id,
  url: browser.runtime.getURL("/") + page,
  frameId: 0,
})
const call = (name: string, data?: any, from = sender()) =>
  handlers.get(name)!({ data, sender: from })
const channel = () =>
  new URL(vi.mocked(browser.tabs.create).mock.calls.at(-1)![0].url!).searchParams.get("capture")!
const consume = (id: string) =>
  call("consumeCapturedImage", { channel: id }, sender(`image-translate.html?capture=${id}`))
beforeEach(async () => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  handlers.clear()
  setupImageTranslationHandlers()
  await browser.storage.local.clear()
  await browser.storage.session.clear()
  vi.spyOn(browser.tabs, "query").mockResolvedValue([
    { id: 10, url: "https://example.com/private" },
  ] as any)
  vi.spyOn(browser.tabs, "captureVisibleTab").mockResolvedValue(image as never)
  vi.spyOn(browser.tabs, "create").mockResolvedValue({ id: 11 } as any)
})
it("captures only from a trusted popup and transfers the image once through an opaque channel", async () => {
  await call("captureImageTranslation", { windowId: 3 })
  expect(browser.tabs.captureVisibleTab).toHaveBeenCalledExactlyOnceWith(3, { format: "png" })
  expect(JSON.stringify(vi.mocked(browser.tabs.create).mock.calls)).not.toMatch(/base64|private/)
  const id = channel()
  expect((await consume(id)).image).toBe(image)
  expect(await consume(id)).toBeNull()
  expect(await browser.storage.local.get(null)).toEqual({})
  expect(await browser.storage.session.get(null)).toEqual({})
})
it("rejects websites, subframes, other extensions and arbitrary extension pages", async () => {
  for (const from of [
    { ...sender(), id: "foreign" },
    { ...sender(), url: "https://example.com/popup.html" },
    { ...sender(), frameId: 2 },
    sender("options.html"),
  ])
    await expect(call("captureImageTranslation", { windowId: 3 }, from)).rejects.toThrow(
      "requires the image translation page",
    )
  expect(browser.tabs.captureVisibleTab).not.toHaveBeenCalled()
})
it("discards a capture if the source tab changed while the API was taking the screenshot", async () => {
  vi.mocked(browser.tabs.query)
    .mockResolvedValueOnce([{ id: 10, url: "https://example.com/first" }] as any)
    .mockResolvedValueOnce([{ id: 12, url: "https://example.com/other" }] as any)
  await expect(call("captureImageTranslation", { windowId: 3 })).rejects.toThrow("Tab đã thay đổi")
  expect(browser.tabs.create).not.toHaveBeenCalled()
})
it("expires and bounds memory-only handoffs, and requires a matching channel URL", async () => {
  await call("captureImageTranslation", { windowId: 3 })
  const first = channel()
  await call("captureImageTranslation", { windowId: 3 })
  const second = channel()
  await call("captureImageTranslation", { windowId: 3 })
  const third = channel()
  expect(await consume(first)).toBeNull()
  expect(() =>
    call("consumeCapturedImage", { channel: second }, sender("image-translate.html")),
  ).toThrow("Invalid image channel")
  expect((await consume(second)).image).toBe(image)
  const now = Date.now()
  vi.spyOn(Date, "now").mockReturnValue(now + IMAGE_CAPTURE_TTL + 1)
  expect(await consume(third)).toBeNull()
})
it("accepts reader-rendered images only from the PDF reader and opens an empty paste page from the popup", async () => {
  await expect(call("openImageTranslation", { image })).rejects.toThrow(
    "requires the image translation page",
  )
  await call("openImageTranslation", { image }, sender("pdf-reader.html"))
  expect((await consume(channel())).image).toBe(image)
  await call("openImageTranslation")
  expect(vi.mocked(browser.tabs.create).mock.calls.at(-1)![0].url).toMatch(/image-translate\.html$/)
  await expect(
    call(
      "openImageTranslation",
      { image: "https://example.com/image.png" },
      sender("pdf-reader.html"),
    ),
  ).rejects.toThrow(/Invalid|Unsupported/)
})
