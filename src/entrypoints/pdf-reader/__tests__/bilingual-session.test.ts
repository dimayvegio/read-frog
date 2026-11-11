import { beforeEach, it, expect, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { PdfBilingualSession, translationConfigIdentity } from "../bilingual-session"
import { extractPdfParagraphs } from "../paragraphs"
const paragraphs = (page = 1) =>
  extractPdfParagraphs(
    [
      { text: "First paragraph.", x: 50, y: 100, width: 200, height: 14 },
      { text: "Second paragraph.", x: 50, y: 200, width: 200, height: 14 },
    ],
    600,
    800,
    page,
  ).paragraphs
const document = { id: "a".repeat(64), title: "Private book.pdf" }
const translator = vi.fn<(...args: any[]) => any>(),
  probe = vi.fn<() => Promise<boolean>>(),
  stale = vi.fn<() => void>()
const create = () =>
  new PdfBilingualSession(structuredClone(DEFAULT_CONFIG), document, probe, stale, translator)
beforeEach(() => {
  vi.clearAllMocks()
  probe.mockResolvedValue(true)
  translator.mockImplementation(async (input) => {
    if (input.cacheOnly) return { output: "", thinking: { status: "complete", text: "" } }
    input.onChunk?.({ output: `Dịch ${input.text}`, thinking: null })
    return { output: `Dịch ${input.text}`, thinking: null }
  })
})
it("opens/scrolls with cache-only reads and sends page requests sequentially only on explicit translation", async () => {
  const session = create()
  session.setPage(1, paragraphs())
  expect(translator).not.toHaveBeenCalled()
  await session.restoreCache()
  expect(translator.mock.calls.every(([input]) => input.cacheOnly === true)).toBe(true)
  translator.mockClear()
  const one = session.translatePage(),
    repeated = session.translatePage()
  await Promise.all([one, repeated])
  expect(translator).toHaveBeenCalledTimes(2)
  expect(translator.mock.calls.map(([input]) => input.text)).toEqual([
    "First paragraph.",
    "Second paragraph.",
  ])
  expect(Object.values(session.getSnapshot().rows).every((row) => row.status === "done")).toBe(true)
  await session.translatePage()
  expect(translator).toHaveBeenCalledTimes(2)
  session.destroy()
})
it("cancels page/file/context transitions and cannot expose late partial/completed output", async () => {
  const session = create()
  session.setPage(1, paragraphs())
  let finish!: (value: unknown) => void
  translator.mockImplementationOnce((input) => {
    input.onChunk({ output: "partial", thinking: null })
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  const pending = session.translatePage()
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"))
  const signal = translator.mock.calls[0]![0].signal as AbortSignal
  session.setPage(2, paragraphs(2))
  expect(signal.aborted).toBe(true)
  finish({ output: "Late wrong paragraph" })
  await pending
  expect(Object.values(session.getSnapshot().rows).every((row) => !row.output)).toBe(true)
  probe.mockResolvedValue(false)
  await session.translatePage()
  expect(stale).toHaveBeenCalledTimes(1)
  expect(session.getSnapshot().rows).toEqual({})
  session.destroy()
})
it("keeps completed paragraphs after a failure, reports cache failures and supports explicit regenerate", async () => {
  const session = create()
  session.setPage(1, paragraphs())
  translator
    .mockImplementationOnce(async (input) => {
      input.onCacheState("not-saved", "Cache đã đầy")
      return { output: "Đã dịch" }
    })
    .mockRejectedValueOnce(new Error("Rate limited"))
  await session.translatePage()
  expect(session.getSnapshot().rows[paragraphs()[0]!.id]?.cacheNote).toBe("Cache đã đầy")
  expect(session.getSnapshot().rows[paragraphs()[1]!.id]?.error).toBe("Rate limited")
  await session.translatePage(paragraphs()[0]!.id, true)
  expect(translator.mock.calls.at(-1)![0].bypassCache).toBe(true)
  expect(session.getSnapshot().busy).toBe(false)
  session.destroy()
})
it("bounds retained pages and separates translation identity from speech voice settings", async () => {
  const session = create()
  for (let page = 1; page <= 8; page++) {
    session.setPage(page, paragraphs(page))
    await session.translatePage()
  }
  expect(new Set(Object.values(session.getSnapshot().rows).map((row) => row.page)).size).toBe(5)
  const config = structuredClone(DEFAULT_CONFIG),
    before = translationConfigIdentity(config)
  config.tts.openai.voice = "coral"
  expect(translationConfigIdentity(config)).toBe(before)
  config.language.targetCode = "en"
  expect(translationConfigIdentity(config)).not.toBe(before)
  session.destroy()
})
it("ignores a stale context probe from a cache restore cancelled by navigation", async () => {
  const session = create()
  session.setPage(1, paragraphs())
  let finish!: (value: boolean) => void
  probe.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const restoring = session.restoreCache()
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"))
  session.setPage(2, paragraphs(2))
  finish(false)
  await restoring
  expect(stale).not.toHaveBeenCalled()
  expect(session.getSnapshot().rows).toEqual({})
  session.destroy()
})
