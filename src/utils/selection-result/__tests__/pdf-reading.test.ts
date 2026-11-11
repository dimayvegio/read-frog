import { sha256 } from "js-sha256"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import {
  pdfHistoryDB,
  pdfCacheKey,
  savePdfHistory,
  readPdfCache,
  listPdfHistory,
  clearPdfHistory,
  type PdfHistoryRecord,
} from "../pdf-history"
import { preparePdfText, DEFAULT_PDF_TEXT_OPTIONS } from "../pdf-text"
import { translateNativeSelection } from "../translate"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
const { stream, send } = vi.hoisted(() => ({
  stream: vi.fn<(...args: any[]) => any>(),
  send: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("@/utils/content-script/background-stream-client", () => ({ streamBackgroundText: stream }))
vi.mock("@/utils/message", () => ({ sendMessage: send }))
const documentA = { id: sha256("a.pdf"), title: "a.pdf" },
  documentB = { id: sha256("b.pdf"), title: "b.pdf" }
const record = (documentId = documentA.id, index = 1): PdfHistoryRecord => ({
  id: pdfCacheKey(documentId, index),
  documentId,
  original: "A paragraph\ncontinued.",
  prepared: "A paragraph continued.",
  output: "Bản dịch tiếng Việt.",
  targetLanguage: "vie",
  model: "gpt-4o-mini",
  clean: true,
  joinHyphenatedWords: false,
  createdAt: 1,
  updatedAt: 2,
})
beforeEach(async () => {
  vi.clearAllMocks()
  for (const table of pdfHistoryDB.tables) await table.clear()
  stream.mockImplementation(async (payload) => ({
    output: payload.prompt.includes('{"lines":[')
      ? JSON.stringify({
          lines: [
            { id: 0, text: "Bản dịch" },
            { id: 1, text: "Đoạn." },
          ],
        })
      : "Bản dịch",
    thinking: { status: "complete", text: "" },
  }))
  send.mockImplementation(async (name) =>
    name === "getOpenAIKeyStatus"
      ? { configured: true, revision: 1 }
      : { revision: 1, entries: [], scopeKey: "global" },
  )
})
describe("conservative PDF text preparation", () => {
  it("joins wrapped prose and soft hyphens while preserving paragraph boundaries and Vietnamese NFC", () => {
    expect(
      preparePdfText(
        "The infra\u00ad\nstructure matters.\nIt is useful.\n\nTie\u0302\u0301ng Vie\u0323\u0302t.",
        DEFAULT_PDF_TEXT_OPTIONS,
      ),
    ).toBe("The infrastructure matters. It is useful.\n\nTiếng Việt.")
  })
  it("retains real hard hyphens by default and only removes them with explicit opt-in", () => {
    expect(preparePdfText("A well-\nknown example.", DEFAULT_PDF_TEXT_OPTIONS)).toBe(
      "A well-known example.",
    )
    expect(preparePdfText("infra-\nstructure", { clean: true, joinHyphenatedWords: true })).toBe(
      "infrastructure",
    )
  })
  it.each([
    "• First item\n• Second item",
    "Name\tScore\nAnn\t10",
    "Name  Score\nAnn   10",
    "x = y + 1\ny = 2",
    "```\nalpha\nbeta\n```",
    "FIRST HEADING\nFollowing paragraph.",
  ])("keeps structured text unchanged: %s", (text) => {
    expect(preparePdfText(text, DEFAULT_PDF_TEXT_OPTIONS)).toBe(text)
  })
  it("allows exact original text without cleanup", () => {
    const text = "  original\r\nwrap-\nword  "
    expect(preparePdfText(text, { clean: false, joinHyphenatedWords: true })).toBe(text)
  })
})
describe("document-local PDF history", () => {
  it("deduplicates cache entries and isolates documents, with no path, prompt or credential fields", async () => {
    const signal = new AbortController().signal,
      first = record(),
      other = record(documentB.id)
    await savePdfHistory(documentA, first, 0, signal)
    await savePdfHistory(documentA, { ...first, createdAt: 500, updatedAt: 600 }, 0, signal)
    await savePdfHistory(documentB, other, 0, signal)
    expect(await listPdfHistory(documentA.id)).toHaveLength(1)
    expect((await readPdfCache(first.id, documentA.id))?.createdAt).toBe(1)
    expect(await readPdfCache(first.id, documentB.id)).toBeNull()
    expect(JSON.stringify(await pdfHistoryDB.translations.toArray())).not.toMatch(
      /apiKey|sourceUrl|file:\/\/|instructions|prompt/,
    )
    await clearPdfHistory(documentA)
    expect(await listPdfHistory(documentA.id)).toHaveLength(0)
    expect(await listPdfHistory(documentB.id)).toHaveLength(1)
  })
  it("does not resurrect history cleared while a stream was in flight", async () => {
    await clearPdfHistory(documentA)
    expect(await savePdfHistory(documentA, record(), 0, new AbortController().signal)).toBe(false)
    expect(await listPdfHistory(documentA.id)).toHaveLength(0)
  })
  it("rejects aborted writes atomically", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(savePdfHistory(documentA, record(), 0, controller.signal)).rejects.toThrow(
      "aborted",
    )
    expect(await pdfHistoryDB.translations.count()).toBe(0)
    expect(await pdfHistoryDB.documents.count()).toBe(0)
  })
  it("keeps existing history when full and allows updates without increasing the record count", async () => {
    const signal = new AbortController().signal,
      first = record()
    await savePdfHistory(documentA, first, 0, signal)
    await pdfHistoryDB.meta.put({ key: "budget", count: 1000, bytes: 1000 })
    await expect(savePdfHistory(documentA, record(documentA.id, 2), 0, signal)).rejects.toThrow(
      "đã đầy",
    )
    await savePdfHistory(documentA, { ...first, output: "Updated" }, 0, signal)
    expect(await pdfHistoryDB.translations.count()).toBe(1)
    expect((await pdfHistoryDB.meta.get("budget"))?.count).toBe(1000)
  })
})
describe("PDF translation cache contracts", () => {
  const config = () => {
    const value = structuredClone(DEFAULT_CONFIG)
    value.glossary.enabled = false
    value.language.targetCode = "vi"
    return value
  }
  const run = (extra: Partial<Parameters<typeof translateNativeSelection>[0]> = {}) =>
    translateNativeSelection({
      text: "Wrapped\nparagraph.",
      config: config(),
      signal: new AbortController().signal,
      onChunk: vi.fn<(...args: any[]) => void>(),
      document: documentA,
      ...extra,
    })
  it("reuses a completed translation without a second API call", async () => {
    await run()
    const onChunk = vi.fn<(...args: any[]) => void>(),
      onCacheState = vi.fn<(...args: any[]) => void>()
    expect((await run({ onChunk, onCacheState })).output).toBe("Bản dịch\nĐoạn.")
    expect(stream).toHaveBeenCalledTimes(1)
    expect(onCacheState).toHaveBeenCalledWith("cached")
    expect(onChunk).toHaveBeenCalledOnce()
    expect(stream.mock.calls[0]![0].prompt).toContain('"text":"Wrapped"')
  })
  it("invalidates after model, target language, instructions, credentials, cleanup or document changes", async () => {
    await run()
    const changedModel = config()
    changedModel.providersConfig[0]!.model.model = "gpt-4o"
    await run({ config: changedModel })
    const changedLanguage = config()
    changedLanguage.language.targetCode = "en"
    await run({ config: changedLanguage })
    await run({ textOptions: { clean: false, joinHyphenatedWords: false } })
    await run({ document: documentB })
    await run({ text: "A different paragraph." })
    const changedPrompt = config()
    changedPrompt.pageTranslation.customPromptsConfig = {
      promptId: "pdf-test",
      patterns: [
        {
          id: "pdf-test",
          name: "PDF test",
          systemPrompt: "Translate precisely.",
          prompt: "{{input}}",
        },
      ],
    }
    await run({ config: changedPrompt })
    send.mockResolvedValue({ configured: true, revision: 2 })
    await run()
    expect(stream).toHaveBeenCalledTimes(8)
  })
  it("uses a fresh glossary in the fingerprint", async () => {
    const current = config()
    current.glossary.enabled = true
    await run({ config: current })
    send.mockImplementation(async (name) =>
      name === "getOpenAIKeyStatus"
        ? { configured: true, revision: 1 }
        : {
            revision: 2,
            scopeKey: "global",
            entries: [
              { matchKey: "wrapped", source: "Wrapped", target: "được bọc", caseSensitive: true },
            ],
          },
    )
    await run({ config: current })
    expect(stream).toHaveBeenCalledTimes(2)
    expect(stream.mock.calls[1]![0].instructions).toContain("được bọc")
  })
  it("allows explicit regeneration and replaces a cache entry without duplicating history", async () => {
    await run()
    await run({ bypassCache: true })
    expect(stream).toHaveBeenCalledTimes(2)
    expect(await listPdfHistory(documentA.id)).toHaveLength(1)
  })
  it("does not cache failures or incomplete empty results", async () => {
    stream.mockRejectedValueOnce(new Error("API failed"))
    await expect(run()).rejects.toThrow("API failed")
    stream.mockResolvedValueOnce({ output: "", thinking: { status: "complete", text: "" } })
    await run()
    expect(await pdfHistoryDB.translations.count()).toBe(0)
  })
  it("keeps a successful translation visible if history storage is full", async () => {
    await pdfHistoryDB.meta.put({ key: "budget", count: 1000, bytes: 0 })
    const onCacheState = vi.fn<(...args: any[]) => void>()
    expect((await run({ onCacheState })).output).toBe("Bản dịch\nĐoạn.")
    expect(onCacheState).toHaveBeenCalledWith("not-saved", expect.stringContaining("đã đầy"))
  })
  it("never saves a late completion after cancellation", async () => {
    const controller = new AbortController()
    stream.mockImplementation(async () => {
      controller.abort()
      return { output: "late" }
    })
    await expect(run({ signal: controller.signal })).rejects.toThrow("aborted")
    expect(await pdfHistoryDB.translations.count()).toBe(0)
  })
})
