import { beforeEach, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { DEFAULT_PDF_TEXT_OPTIONS } from "@/utils/selection-result/pdf-text"
import { translateNativeSelection } from "@/utils/selection-result/translate"
import { imageCacheDB, clearImageCache } from "../cache"
import { recognizeImage } from "../recognize"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
const { ocr, fast, text, send } = vi.hoisted(() => ({
  ocr: vi.fn<(...args: any[]) => any>(),
  fast: vi.fn<(...args: any[]) => any>(),
  text: vi.fn<(...args: any[]) => any>(),
  send: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("@/utils/content-script/background-stream-client", () => ({
  streamBackgroundImageText: ocr,
  streamBackgroundImageTranslation: fast,
  streamBackgroundText: text,
}))
vi.mock("@/utils/message", () => ({ sendMessage: send }))
const image = "data:image/png;base64,iVBORw0KGgoAAA=="
let config = structuredClone(DEFAULT_CONFIG),
  revision = 1,
  terms: any[] = []
const recognize = (mode: "fast" | "two-step" = "fast", extra: Record<string, unknown> = {}) =>
  recognizeImage({
    image,
    mode,
    config,
    options: DEFAULT_PDF_TEXT_OPTIONS,
    signal: new AbortController().signal,
    onStatus: vi.fn<(message: string) => void>(),
    onChunk: vi.fn<(a: string, b: string) => void>(),
    ...extra,
  })
const translate = (original: string, extra: Record<string, unknown> = {}) =>
  translateNativeSelection({
    text: original,
    config,
    imageCache: true,
    signal: new AbortController().signal,
    onChunk: vi.fn<(...args: any[]) => void>(),
    ...extra,
  })
beforeEach(async () => {
  vi.clearAllMocks()
  for (const table of imageCacheDB.tables) await table.clear()
  config = structuredClone(DEFAULT_CONFIG)
  config.glossary.enabled = false
  revision = 1
  terms = []
  send.mockImplementation(async (name) =>
    name === "getOpenAIKeyStatus"
      ? { configured: true, revision }
      : { revision: 1, entries: terms, scopeKey: "global" },
  )
  ocr.mockResolvedValue({ output: "Hello world", thinking: { status: "complete", text: "" } })
  fast.mockResolvedValue({
    output: { original: "Hello world", translation: "Xin chào" },
    thinking: { status: "complete", text: "" },
  })
  text.mockResolvedValue({
    output: "Dịch thông thường",
    thinking: { status: "complete", text: "" },
  })
})
it("uses one request cold and zero requests warm, including the shared result view", async () => {
  const first = await recognize()
  expect((await translate(first.original, { pretranslated: first.pretranslated })).output).toBe(
    "Xin chào",
  )
  const second = await recognize()
  await translate(second.original, { pretranslated: second.pretranslated })
  expect(fast).toHaveBeenCalledTimes(1)
  expect(ocr).not.toHaveBeenCalled()
  expect(text).not.toHaveBeenCalled()
})
it("caches OCR and normal text translation separately, including corrected source text", async () => {
  const first = await recognize("two-step")
  await translate(first.original)
  await recognize("two-step")
  await translate(first.original)
  expect(ocr).toHaveBeenCalledTimes(1)
  expect(text).toHaveBeenCalledTimes(1)
  await translate("Corrected text")
  expect(text).toHaveBeenCalledTimes(2)
  config.language.targetCode = "eng"
  await recognize("two-step")
  await translate(first.original)
  expect(ocr).toHaveBeenCalledTimes(1)
  expect(text).toHaveBeenCalledTimes(3)
})
it("force read and regenerate bypass caches without discarding the normal pipeline", async () => {
  const first = await recognize()
  await recognize("fast", { bypass: true })
  expect(fast).toHaveBeenCalledTimes(2)
  await translate(first.original, { pretranslated: first.pretranslated, bypassCache: true })
  expect(text).toHaveBeenCalledTimes(1)
})
it("normalizes cleanup options independently of object property order", async () => {
  await recognize()
  await recognize("fast", { options: { joinHyphenatedWords: false, clean: true } })
  expect(fast).toHaveBeenCalledOnce()
  await translate("Source")
  await translate("Source", { textOptions: { joinHyphenatedWords: false, clean: true } })
  expect(text).toHaveBeenCalledOnce()
})
it.each(["target", "model", "reasoning", "temperature", "key", "prompt", "glossary", "cleanup"])(
  "invalidates fast results after changing %s",
  async (field) => {
    const first = await recognize()
    let options = DEFAULT_PDF_TEXT_OPTIONS
    if (field === "target") config.language.targetCode = "eng"
    if (field === "model")
      config.providersConfig[0]!.model = {
        ...config.providersConfig[0]!.model,
        isCustomModel: true,
        customModel: "test-model",
      }
    if (field === "reasoning") config.providersConfig[0]!.reasoning = "high"
    if (field === "temperature") config.providersConfig[0]!.temperature = 0.7
    if (field === "key") revision++
    if (field === "prompt") config.pageTranslation.customPromptsConfig.promptId = "a-new-style"
    if (field === "glossary") {
      config.glossary.enabled = true
      terms = [{ source: "Hello", target: "Xin chào" }]
    }
    if (field === "cleanup") options = { clean: false, joinHyphenatedWords: false }
    // The old one-call result cannot suppress a newly configured translation.
    if (field !== "glossary")
      await translate(first.original, { pretranslated: first.pretranslated, textOptions: options })
    const second = await recognize("fast", { options })
    expect(fast.mock.calls.length + ocr.mock.calls.length).toBe(2)
    expect(second.original).toBe("Hello world")
    expect(text).toHaveBeenCalledTimes(field === "glossary" ? 0 : 1)
    const fallback = field === "prompt" || field === "glossary"
    expect(ocr).toHaveBeenCalledTimes(fallback ? 1 : 0)
    expect(second.pretranslated === undefined).toBe(fallback)
  },
)
it("does not cache failures, empty OCR, truncated pairs or aborted requests", async () => {
  fast.mockRejectedValueOnce(new Error("Failed"))
  await expect(recognize()).rejects.toThrow("Failed")
  fast.mockResolvedValueOnce({ output: { original: "", translation: "" } })
  await expect(recognize()).rejects.toThrow("Không đọc được")
  fast.mockResolvedValueOnce({ output: { original: "x".repeat(20001), translation: "Text" } })
  await expect(recognize()).rejects.toThrow(/Too big/)
  const controller = new AbortController()
  controller.abort()
  await expect(recognize("fast", { signal: controller.signal })).rejects.toThrow(/abort/i)
  expect(await imageCacheDB.entries.count()).toBe(0)
})
it("does not revive cached results cleared while a request was in flight", async () => {
  fast.mockImplementationOnce(async () => {
    await clearImageCache()
    return { output: { original: "Hello", translation: "Chào" } }
  })
  await recognize()
  expect(await imageCacheDB.entries.count()).toBe(0)
})
