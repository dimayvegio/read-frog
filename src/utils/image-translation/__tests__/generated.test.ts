import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { clearImageCache, imageCacheDB } from "../cache"
import { clearGeneratedImages, generateTranslatedImage } from "../generated"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
const { port, send, bitmap } = vi.hoisted(() => ({
  port: vi.fn<(...args: any[]) => any>(),
  send: vi.fn<(...args: any[]) => any>(),
  bitmap: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("@/utils/content-script/port-streaming", () => ({ createPortStreamPromise: port }))
vi.mock("@/utils/message", () => ({ sendMessage: send }))
vi.mock("@/utils/config/storage", () => ({ getLocalConfig: async () => structuredClone(config) }))
let config = structuredClone(DEFAULT_CONFIG),
  revision = 1
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXsAAAAASUVORK5CYII="
const image = `data:image/png;base64,${png}`
const run = (extra: Partial<Parameters<typeof generateTranslatedImage>[0]> = {}) =>
  generateTranslatedImage({
    image,
    config,
    model: "gpt-image-2.6-sunburst",
    quality: "high",
    signal: new AbortController().signal,
    onStatus: vi.fn<() => void>(),
    ...extra,
  })
beforeEach(async () => {
  vi.clearAllMocks()
  clearGeneratedImages()
  for (const table of imageCacheDB.tables) await table.clear()
  config = structuredClone(DEFAULT_CONFIG)
  config.language.targetCode = "vi"
  revision = 1
  send.mockImplementation(async () => ({ configured: true, revision }))
  port.mockResolvedValue({ image, width: 1, height: 1 })
  bitmap.mockResolvedValue({ width: 1, height: 1, close: vi.fn<() => void>() })
  vi.stubGlobal("createImageBitmap", bitmap)
})
afterEach(() => vi.unstubAllGlobals())
it("reuses raw output in RAM, only explicit regenerate bypasses it, and never stores binary in DB1", async () => {
  expect(await run()).toMatchObject({ image })
  await run()
  expect(port).toHaveBeenCalledTimes(1)
  await run({ bypass: true })
  expect(port).toHaveBeenCalledTimes(2)
  expect(await imageCacheDB.table("entries").count()).toBe(0)
})
it("invalidates on selected target, model, quality and credential revision", async () => {
  await run()
  config.language.targetCode = "en"
  await run()
  await run({ model: "gpt-image-2.6-flare" })
  await run({ quality: "low" })
  revision++
  await run()
  expect(port).toHaveBeenCalledTimes(5)
})
it("cache clearing rejects a pending result and cannot repopulate RAM", async () => {
  port.mockImplementation(async () => {
    clearGeneratedImages()
    return { image }
  })
  await expect(run()).rejects.toThrow("cache")
  port.mockResolvedValue({ image })
  await run()
  expect(port).toHaveBeenCalledTimes(2)
})
it("keys the completed image by normalized additional instructions and forwards them without another AI step", async () => {
  await run({ extraInstructions: "  Keep STA unchanged.\nUse short labels.  " })
  expect(port.mock.calls[0]![1]).toMatchObject({
    extraInstructions: "Keep STA unchanged.\nUse short labels.",
  })
  await run({ extraInstructions: "Keep STA unchanged.\nUse short labels." })
  expect(port).toHaveBeenCalledOnce()
  await run({ extraInstructions: "Use larger text." })
  expect(port).toHaveBeenCalledTimes(2)
})
it("rejects oversized custom instructions before any image request", async () => {
  await expect(run({ extraInstructions: "x".repeat(4001) })).rejects.toThrow("4000")
  expect(port).not.toHaveBeenCalled()
})
it("separates resolution and extended quality cache entries without resizing the raw reply", async () => {
  await run({ outputSize: "2k" })
  await run({ outputSize: "2k" })
  expect(port).toHaveBeenCalledOnce()
  expect(port.mock.calls[0]![1]).toMatchObject({ outputSize: "2k" })
  await run({ outputSize: "4k", quality: "max" })
  expect(port).toHaveBeenCalledTimes(2)
  expect(await run({ outputSize: "4k", quality: "max" })).toMatchObject({
    image,
    width: 1,
    height: 1,
  })
  expect(port).toHaveBeenCalledTimes(2)
})
it("DB clear epochs reject late results", async () => {
  port.mockImplementation(async () => {
    await clearImageCache()
    return { image }
  })
  await expect(run()).rejects.toThrow("cache")
})
it("rejects corrupt complete images and does not cache them", async () => {
  bitmap.mockRejectedValue(new Error("invalid PNG"))
  await expect(run()).rejects.toThrow("invalid PNG")
  await expect(run()).rejects.toThrow("invalid PNG")
  expect(port).toHaveBeenCalledTimes(2)
})
it("keeps at most two cached images and does not reuse expired results", async () => {
  await run()
  await run({ quality: "medium" })
  await run({ quality: "low" })
  await run()
  expect(port).toHaveBeenCalledTimes(4)
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60_000)
  try {
    await run()
    expect(port).toHaveBeenCalledTimes(5)
  } finally {
    vi.restoreAllMocks()
  }
})
