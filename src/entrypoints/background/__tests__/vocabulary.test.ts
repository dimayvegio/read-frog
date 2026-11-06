import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { vocabularyFixture } from "@/utils/vocabulary/__tests__/fixtures"
import { vocabularyDB, exportLibrary, createNotebook } from "@/utils/vocabulary/db"
import { saveVocabulary } from "../vocabulary"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})

const mocks = vi.hoisted(() => ({
  generate: vi.fn<(...args: any[]) => any>(),
  audio: vi.fn<(...args: any[]) => any>(),
  resolve: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateText: mocks.generate,
}))
vi.mock("../openai-runtime", () => ({ resolveOpenAIExecution: mocks.resolve }))
vi.mock("../openai-tts", () => ({ generateOpenAIAudio: mocks.audio }))
vi.mock("../config", () => ({ ensureInitializedConfig: async () => DEFAULT_CONFIG }))
const capture = {
  word: "reverse",
  context: "The election is unlikely to reverse demand.",
  sourceTitle: "Article",
  sourceUrl: "https://example.com/article",
}
beforeEach(async () => {
  vi.clearAllMocks()
  for (const table of vocabularyDB.tables) await table.clear()
  const fixture = await vocabularyFixture()
  const {
    id: _id,
    captureKey: _key,
    createdAt: _created,
    updatedAt: _updated,
    context: _context,
    sourceTitle: _title,
    sourceUrl: _url,
    audio: _audio,
    speech: _speech,
    ...output
  } = fixture.cards[0]!
  mocks.generate.mockResolvedValue({ output })
  mocks.resolve.mockResolvedValue({ model: "fixture-model", params: {} })
  mocks.audio.mockResolvedValue({
    audioBase64: Buffer.from(fixture.audio[0]!.bytes).toString("base64"),
    contentType: "audio/wav",
  })
})
describe("vocabulary generation", () => {
  it("saves both clips and structured content atomically and avoids repeat API work", async () => {
    const stages: string[] = []
    const saved = await saveVocabulary(capture, { onChunk: (e) => stages.push(e.stage) })
    expect(saved.stage).toBe("saved")
    expect(stages).toEqual(["text", "word-audio", "example-audio"])
    expect(mocks.audio).toHaveBeenCalledTimes(2)
    expect(mocks.generate.mock.calls[0]![0].output).toBeTruthy()
    expect(mocks.generate.mock.calls[0]![0].instructions).toContain("quoted data")
    expect(await saveVocabulary(capture)).toMatchObject({ duplicate: true, cardId: saved.cardId })
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(await exportLibrary())).not.toContain("apiKey")
  })
  it("leaves no partial card or orphan audio when the second audio request fails", async () => {
    mocks.audio
      .mockResolvedValueOnce({
        audioBase64: Buffer.from((await vocabularyFixture()).audio[0]!.bytes).toString("base64"),
        contentType: "audio/wav",
      })
      .mockRejectedValueOnce(new Error("speech failed"))
    await expect(saveVocabulary(capture)).rejects.toThrow("speech failed")
    expect(await vocabularyDB.notebookCards.count()).toBe(0)
    expect(await vocabularyDB.audio.count()).toBe(0)
  })
  it("does not save a cancelled generation or start the next audio after cancellation", async () => {
    const controller = new AbortController()
    mocks.audio.mockImplementationOnce(() => {
      controller.abort()
      return Promise.resolve({ audioBase64: "AA==", contentType: "audio/wav" })
    })
    await expect(saveVocabulary(capture, { signal: controller.signal })).rejects.toThrow(/abort/i)
    expect(mocks.audio).toHaveBeenCalledTimes(1)
    expect(await vocabularyDB.notebookCards.count()).toBe(0)
  })
  it("rejects invalid capture payloads and wrong-word output before generating audio", async () => {
    await expect(saveVocabulary({ ...capture, word: "a".repeat(161) })).rejects.toThrow(/Too big/)
    expect(mocks.generate).not.toHaveBeenCalled()
    const result = await mocks.generate()
    result.output.word = "different"
    await expect(saveVocabulary(capture)).rejects.toThrow("selected word")
    expect(mocks.audio).not.toHaveBeenCalled()
  })
  it("saves a cached word to a second notebook without more OpenAI calls", async () => {
    await saveVocabulary(capture)
    const second = await createNotebook("Sổ 2")
    const result = await saveVocabulary({ ...capture, notebookId: second.id })
    expect(result).toMatchObject({ notebookId: second.id, duplicate: false })
    expect((await exportLibrary(second.id)).cards).toHaveLength(1)
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    expect(mocks.audio).toHaveBeenCalledTimes(2)
  })
})
