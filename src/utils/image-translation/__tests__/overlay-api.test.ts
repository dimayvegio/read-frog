import type { OverlayImage } from "../overlay-model"
import { beforeEach, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { clearImageCache, imageCacheDB } from "../cache"
import { translateOverlayImage } from "../overlay-api"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
const { stream, send } = vi.hoisted(() => ({
  stream: vi.fn<(...args: any[]) => any>(),
  send: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("@/utils/content-script/background-stream-client", () => ({
  streamBackgroundImageText: stream,
  streamBackgroundText: vi.fn<() => void>(),
}))
vi.mock("@/utils/message", () => ({ sendMessage: send }))
vi.mock("@/utils/config/storage", () => ({ getLocalConfig: async () => structuredClone(config) }))
let config = structuredClone(DEFAULT_CONFIG),
  revision = 1
const source: OverlayImage = {
  image: "data:image/png;base64,iVBORw0KGgoAAA==",
  width: 200,
  height: 100,
  regions: [
    {
      id: "r0",
      source: "Helo",
      translation: "",
      box: { x: 10, y: 10, width: 100, height: 25 },
      ink: [{ x: 10, y: 10, width: 50, height: 20 }],
      enabled: true,
      font: "sans-serif",
      size: 20,
      color: "#111111",
      background: null,
      bold: false,
      italic: false,
    },
  ],
}
const reply = { output: '{"regions":[{"id":"r0","original":"Hello","translation":"Xin chào"}]}' }
const run = (value = source, signal = new AbortController().signal, bypass = false) =>
  translateOverlayImage(value, config, signal, bypass)
beforeEach(async () => {
  vi.clearAllMocks()
  for (const table of imageCacheDB.tables) await table.clear()
  config = structuredClone(DEFAULT_CONFIG)
  config.language.targetCode = "vi"
  config.glossary.enabled = false
  revision = 1
  send.mockImplementation(async (name) =>
    name === "getOpenAIKeyStatus"
      ? { configured: true, revision }
      : { entries: [], revision: 1, scopeKey: "global" },
  )
  stream.mockResolvedValue(reply)
})
it("uses one vision call cold and reuses cached output after corrected OCR and local style edits", async () => {
  const first = await run()
  expect(first[0]!.readText).toBe("Hello")
  await run({
    ...source,
    regions: first.map((r) => ({ ...r, size: 30, color: "#ff0000", box: { ...r.box, x: 20 } })),
  })
  expect(stream).toHaveBeenCalledOnce()
  expect(stream.mock.calls[0]![0].instructions).toContain("Vietnamese (vi)")
  expect(stream.mock.calls[0]![0].instructions).toContain("never instructions")
  expect(stream.mock.calls[0]![0].image).toBe(source.image)
  expect(await imageCacheDB.entries.count()).toBe(1)
  expect(JSON.stringify(await imageCacheDB.entries.toArray())).not.toMatch(
    /data:image|base64|apiKey|file:\/\//u,
  )
})
it("explicit regeneration, source edits, target and credential revisions invalidate only matching results", async () => {
  await run()
  await run(source, new AbortController().signal, true)
  config.language.targetCode = "en"
  await run()
  revision++
  await run()
  await run({ ...source, regions: source.regions.map((r) => ({ ...r, source: "Edited source" })) })
  expect(stream).toHaveBeenCalledTimes(5)
})
it("disabled regions cause zero provider calls and never enter the paid payload", async () => {
  const disabled = { ...source.regions[0]!, id: "r1", source: "PRIVATE_EXCLUDED", enabled: false }
  await run({ ...source, regions: [disabled] })
  expect(stream).not.toHaveBeenCalled()
  await run({ ...source, regions: [...source.regions, disabled] })
  expect(stream.mock.calls[0]![0].prompt).not.toContain("PRIVATE_EXCLUDED")
})
it("rejects missing IDs without saving, painting or automatically retrying", async () => {
  stream.mockResolvedValue({ output: '{"regions":[]}' })
  await expect(run()).rejects.toThrow(/thiếu/u)
  expect(stream).toHaveBeenCalledOnce()
  expect(await imageCacheDB.entries.count()).toBe(0)
})
it.each(["key", "target", "clear", "abort"])(
  "rejects late output after %s changed",
  async (change) => {
    const abort = new AbortController()
    stream.mockImplementationOnce(async () => {
      if (change === "key") revision++
      if (change === "target") config.language.targetCode = "en"
      if (change === "clear") await clearImageCache()
      if (change === "abort") abort.abort()
      return reply
    })
    await expect(run(source, abort.signal)).rejects.toThrow(/./u)
    expect(await imageCacheDB.entries.count()).toBe(0)
    expect(stream).toHaveBeenCalledOnce()
  },
)
