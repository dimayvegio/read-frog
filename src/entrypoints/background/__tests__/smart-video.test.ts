import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { executeSmartVideo, handleSmartVideoPort, trustedSmartVideoSender } from "../smart-video"
const h = vi.hoisted(() => ({
  key: vi.fn<(...args: any[]) => any>(),
  status: vi.fn<(...args: any[]) => any>(),
  finish: vi.fn<(...args: any[]) => any>(),
  run: null as any,
}))
vi.mock("../config", () => ({ ensureInitializedConfig: async () => ({}) }))
vi.mock("../openai-credentials", () => ({
  readOpenAIExecutionCredential: h.key,
  readOpenAIKeyStatus: h.status,
}))
vi.mock("../usage", () => ({ beginUsage: async () => ({ finish: h.finish }) }))
vi.mock("../background-stream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../background-stream")>()
  return {
    ...actual,
    createStreamPortHandler: (fn: any) => () => {
      h.run = fn
    },
  }
})
const url = "https://www.youtube.com/watch?v=test"
const request = () => ({
  sourceUrl: url,
  audio: Buffer.from("RIFF0000WAVE0000").toString("base64"),
  format: "wav",
  duration: 2,
  title: "Private title",
  target: "vi",
  cues: [{ text: "Hello", start: 0, end: 1000 }],
})
const profile = () => ({
  audioMatchesTranscript: true,
  summary: "Chào hỏi",
  context: "Cuộc chào hỏi",
  speakers: [
    {
      id: "s1",
      presentation: "unclear",
      description: "Calm",
      voice: "marin",
      speed: 1,
      instructions: "Calm.",
    },
  ],
  assignments: [{ from: 0, to: 0, speaker: "s1", confidence: 0.9 }],
})
const response = () =>
  new Response(
    JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(profile()) } }],
      usage: { prompt_tokens: 23, completion_tokens: 42 },
    }),
  )
beforeEach(() => {
  vi.clearAllMocks()
  h.run = null
  h.key.mockResolvedValue({ apiKey: "private-test-key", revision: 1 })
  h.status.mockResolvedValue({ configured: true, revision: 1 })
  vi.stubGlobal(
    "fetch",
    vi.fn<(...args: any[]) => any>().mockImplementation(async () => response()),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it("sends explicit audio and indexed CC only to fixed OpenAI, excludes source URL and records numeric usage", async () => {
  const result = await executeSmartVideo(request(), new AbortController().signal, async () => true)
  expect(result.speakers[0]?.voice).toBe("marin")
  const [endpoint, options] = vi.mocked(fetch).mock.calls[0]!
  expect(endpoint).toBe("https://api.openai.com/v1/chat/completions")
  const body = JSON.parse(options!.body as string)
  expect(body.model).toBe("gpt-audio-1.5")
  expect(body.store).toBe(false)
  expect(options!.body).not.toContain(url)
  expect(options!.body).not.toContain("private-test-key")
  expect(body.messages[1].content[1].input_audio.format).toBe("wav")
  expect(h.finish).toHaveBeenCalledWith("complete", { input: 23, output: 42, audioMs: 2000 })
})
it("does not pay on abort, invalid audio or a stale document; never automatically retries malformed output", async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(executeSmartVideo(request(), controller.signal, async () => true)).rejects.toThrow(
    /./,
  )
  await expect(
    executeSmartVideo(
      { ...request(), audio: Buffer.from("invalid audio...").toString("base64") },
      new AbortController().signal,
      async () => true,
    ),
  ).rejects.toThrow(/MP3\/WAV/)
  await expect(
    executeSmartVideo(request(), new AbortController().signal, async () => {
      throw new Error("stale")
    }),
  ).rejects.toThrow(/stale/)
  expect(fetch).not.toHaveBeenCalled()
  vi.mocked(fetch).mockResolvedValue(new Response('{"choices":[]}'))
  await expect(
    executeSmartVideo(request(), new AbortController().signal, async () => true),
  ).rejects.toThrow(/Không tự thử lại|không tự thử lại/)
  expect(fetch).toHaveBeenCalledOnce()
})
it("rejects results after credentials or source ownership change", async () => {
  h.status.mockResolvedValue({ configured: true, revision: 2 })
  await expect(
    executeSmartVideo(request(), new AbortController().signal, async () => true),
  ).rejects.toThrow(/Khóa OpenAI đã đổi/)
  h.status.mockResolvedValue({ configured: true, revision: 1 })
  let checks = 0
  await expect(
    executeSmartVideo(request(), new AbortController().signal, async () => {
      if (++checks > 1) throw new Error("old source")
    }),
  ).rejects.toThrow(/chưa đủ chắc chắn/)
  expect(h.finish).not.toHaveBeenCalledWith("complete", expect.anything())
})
it("requires the current browser route and matching modern document IDs, with strict legacy fallback", async () => {
  const sender = {
    id: browser.runtime.id,
    tab: { id: 7 },
    frameId: 0,
    url,
    documentId: "doc1",
  } as any
  const disconnect = vi.fn<() => void>()
  vi.spyOn(browser.webNavigation, "getFrame").mockResolvedValue({ url, documentId: "doc1" } as any)
  vi.spyOn(browser.tabs, "get").mockResolvedValue({ url } as any)
  expect(trustedSmartVideoSender({ ...sender, id: "other" })).toBe(false)
  expect(trustedSmartVideoSender({ ...sender, url: "https://example.org" })).toBe(false)
  handleSmartVideoPort({ sender, disconnect } as any)
  vi.mocked(browser.webNavigation.getFrame).mockResolvedValue({ url, documentId: "doc2" } as any)
  await expect(h.run(request(), {})).rejects.toThrow(/Tài liệu video đã đổi/)
  expect(fetch).not.toHaveBeenCalled()
  vi.mocked(browser.webNavigation.getFrame).mockResolvedValue({
    url: url + "2",
    documentId: "doc1",
  } as any)
  await expect(h.run(request(), {})).rejects.toThrow(/Nguồn video đã đổi/)
  vi.mocked(browser.webNavigation.getFrame).mockResolvedValue({ url, documentId: "doc1" } as any)
  await expect(h.run(request(), {})).resolves.toHaveProperty("trackHash")
})
