import { beforeEach, describe, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { DEFAULT_OPENAI_CONFIG } from "@/types/config/openai"
import {
  prepareStudyWords,
  STUDY_SEGMENTATION_INSTRUCTIONS,
} from "@/utils/subtitles/study-segmentation"
import { segmentStudyWindow, isYouTubeStudySender } from "../sentence-study"

const mock = vi.hoisted(() => ({
  generate: vi.fn<(...args: any[]) => any>(),
  get: vi.fn<(...args: any[]) => any>(),
  put: vi.fn<(...args: any[]) => any>(),
  remove: vi.fn<(...args: any[]) => any>(),
  resolve: vi.fn<(...args: any[]) => any>(),
  status: vi.fn<(...args: any[]) => any>(),
  hit: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("../background-stream", () => ({
  generateTextForProviderRef: mock.generate,
  createStartMessageParser: vi.fn<(...args: any[]) => any>(),
  createStreamPortHandler: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("../config", () => ({ ensureInitializedConfig: async () => ({}) }))
vi.mock("../openai-credentials", () => ({ readOpenAIKeyStatus: mock.status }))
vi.mock("../usage", () => ({ recordCacheHit: mock.hit }))
vi.mock("@/utils/subtitles/processor/translator", () => ({
  resolveSubtitlesProviderRef: mock.resolve,
}))
vi.mock("@/utils/db/dexie/db", () => ({
  db: { aiSegmentationCache: { get: mock.get, put: mock.put, delete: mock.remove } },
}))

const words = prepareStudyWords([
  { text: "Yes.", start: 0, end: 1000 },
  { text: "I agree.", start: 1000, end: 2000 },
])
const ref = { kind: "local", config: DEFAULT_OPENAI_CONFIG }
beforeEach(() => {
  vi.resetAllMocks()
  mock.resolve.mockResolvedValue(ref)
  mock.status.mockResolvedValue({ configured: true, revision: 1 })
  mock.generate.mockResolvedValue('{"ends":[0,2]}')
})
describe("private OpenAI study segmentation", () => {
  it("uses the current subtitle model, word-index prompt and cancellable existing runtime", async () => {
    const controller = new AbortController()
    expect(await segmentStudyWindow(words, controller.signal)).toEqual([0, 2])
    expect(mock.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        providerRef: ref,
        usageTask: "segmentation",
        instructions: STUDY_SEGMENTATION_INSTRUCTIONS,
      }),
      { signal: controller.signal },
    )
    const prompt = JSON.parse(mock.generate.mock.calls[0]![0].prompt)
    expect(prompt.words.map((word: { t: string }) => word.t)).toEqual(["Yes.", "I", "agree."])
    expect(mock.put).toHaveBeenCalledWith(expect.objectContaining({ result: '{"ends":[0,2]}' }))
  })
  it("returns validated cache without a paid request and separates model/credential revisions", async () => {
    mock.get.mockResolvedValue({ result: '{"ends":[0,2]}' })
    await segmentStudyWindow(words, new AbortController().signal)
    const key = mock.get.mock.calls[0]![0]
    mock.status.mockResolvedValue({ configured: true, revision: 2 })
    await segmentStudyWindow(words, new AbortController().signal)
    expect(mock.get.mock.calls[1]![0]).not.toBe(key)
    mock.resolve.mockResolvedValue({
      ...ref,
      config: { ...DEFAULT_OPENAI_CONFIG, temperature: 0.2 },
    })
    await segmentStudyWindow(words, new AbortController().signal)
    expect(mock.get.mock.calls[2]![0]).not.toBe(mock.get.mock.calls[1]![0])
    expect(mock.generate).not.toHaveBeenCalled()
    expect(mock.hit).toHaveBeenCalledTimes(3)
  })
  it("refuses omissions and corrupted cache, never caches invalid output", async () => {
    mock.get.mockResolvedValue({ result: '{"ends":[0]}' })
    mock.generate.mockResolvedValue('{"ends":[0]}')
    await expect(segmentStudyWindow(words, new AbortController().signal)).rejects.toThrow(/Missing/)
    expect(mock.remove).toHaveBeenCalledTimes(1)
    expect(mock.put).not.toHaveBeenCalled()
  })
  it("does not call OpenAI for invalid input, absent key or an already cancelled mode", async () => {
    await expect(segmentStudyWindow([], new AbortController().signal)).rejects.toThrow(/./)
    mock.status.mockResolvedValue({ configured: false, revision: 2 })
    await expect(segmentStudyWindow(words, new AbortController().signal)).rejects.toThrow(
      /Configure/,
    )
    const controller = new AbortController()
    controller.abort()
    await expect(segmentStudyWindow(words, controller.signal)).rejects.toThrow(/./)
    expect(mock.generate).not.toHaveBeenCalled()
  })
  it("discards a result cancelled or superseded by a credential change before caching", async () => {
    const controller = new AbortController()
    mock.generate.mockImplementation(async () => {
      controller.abort()
      return '{"ends":[0,2]}'
    })
    await expect(segmentStudyWindow(words, controller.signal)).rejects.toThrow(/./)
    expect(mock.put).not.toHaveBeenCalled()
    mock.generate.mockResolvedValue('{"ends":[0,2]}')
    mock.status
      .mockResolvedValueOnce({ configured: true, revision: 1 })
      .mockResolvedValueOnce({ configured: true, revision: 2 })
    await expect(segmentStudyWindow(words, new AbortController().signal)).rejects.toThrow(/changed/)
    expect(mock.put).not.toHaveBeenCalled()
  })
  it("accepts only this extension's top-level HTTPS YouTube content script", () => {
    const sender = {
      id: browser.runtime.id,
      tab: { id: 10 },
      frameId: 0,
      url: "https://www.youtube.com/watch?v=example",
    }
    expect(isYouTubeStudySender(sender)).toBe(true)
    for (const patch of [
      { id: "other" },
      { frameId: 2 },
      { url: "https://youtube.com.attacker.example/" },
      { url: "file:///test" },
      { tab: undefined },
    ])
      expect(isYouTubeStudySender({ ...sender, ...patch })).toBe(false)
  })
})
