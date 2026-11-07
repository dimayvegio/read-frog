import { TextEncoder, TextDecoder } from "node:util"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { practiceFeedback, practiceWav } from "@/utils/pronunciation/__tests__/fixtures"
import { pronunciationDB, clearPronunciationHistory } from "@/utils/pronunciation/db"
import { criterionKeys, type PronunciationRequest } from "@/utils/pronunciation/schema"
import {
  assessPronunciation,
  trustedPronunciation,
  setupPronunciationHandlers,
} from "../pronunciation"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
const { credential, status, handlers, finish, cache } = vi.hoisted(() => ({
  credential: vi.fn<(...args: any[]) => any>(),
  status: vi.fn<(...args: any[]) => any>(),
  handlers: new Map<string, (...args: any[]) => any>(),
  finish: vi.fn<(...args: any[]) => any>(),
  cache: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("../config", () => ({ ensureInitializedConfig: async () => ({}) }))
vi.mock("../openai-credentials", () => ({
  readOpenAIExecutionCredential: credential,
  readOpenAIKeyStatus: status,
}))
vi.mock("../usage", () => ({ beginUsage: async () => ({ finish }), recordCacheHit: cache }))
vi.mock("@/utils/message", () => ({
  onMessage: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler),
}))
const payload = (): PronunciationRequest => ({
  text: "Read it again.",
  context: "Present tense",
  wav: practiceWav(),
})
const response = (feedback: unknown = practiceFeedback()) =>
  new Response(
    JSON.stringify({
      model: "gpt-audio-1.5",
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(feedback) } }],
      usage: {
        prompt_tokens: 123,
        completion_tokens: 456,
        prompt_tokens_details: { cached_tokens: 12 },
      },
    }),
    { status: 200 },
  )
beforeEach(async () => {
  vi.stubGlobal("TextEncoder", TextEncoder)
  vi.stubGlobal("TextDecoder", TextDecoder)
  vi.clearAllMocks()
  handlers.clear()
  await clearPronunciationHistory()
  status.mockResolvedValue({ configured: true, revision: 10 })
  credential.mockResolvedValue({ apiKey: "secret-pronunciation-key", revision: 10 })
  vi.stubGlobal(
    "fetch",
    vi.fn<(...args: any[]) => any>().mockImplementation(async () => response()),
  )
})
afterEach(() => vi.unstubAllGlobals())
it("keeps capture one-use and path-free, with popup failure falling back to a tab", async () => {
  setupPronunciationHandlers()
  vi.spyOn(browser.windows, "create").mockRejectedValueOnce(new Error("popup unavailable"))
  const create = vi.spyOn(browser.tabs, "create").mockResolvedValueOnce({} as any)
  const capture = { text: "read", context: "Present tense" }
  await handlers.get("openPronunciation")!({ sender: { id: browser.runtime.id }, data: capture })
  const url = create.mock.calls[0]![0].url!,
    channel = new URL(url).searchParams.get("channel")!
  expect(url).not.toContain("read&")
  expect(url).not.toContain("Present")
  const sender = {
    id: browser.runtime.id,
    url: browser.runtime.getURL("/pronunciation.html"),
    frameId: 0,
  }
  expect(trustedPronunciation(sender)).toBe(true)
  for (const wrong of [
    { ...sender, id: "other" },
    { ...sender, url: "https://fake.test/pronunciation.html" },
    { ...sender, frameId: 1 },
    { ...sender, url: browser.runtime.getURL("/options.html") },
  ]) {
    expect(trustedPronunciation(wrong)).toBe(false)
    expect(() =>
      handlers.get("consumePronunciationCapture")!({ sender: wrong, data: { channel } }),
    ).toThrow(/./)
  }
  expect(handlers.get("consumePronunciationCapture")!({ sender, data: { channel } })).toEqual(
    capture,
  )
  expect(handlers.get("consumePronunciationCapture")!({ sender, data: { channel } })).toBeNull()
})
it("uses explicit audio input, fixed US rubric, private key and exact endpoint; cache never duplicates logs", async () => {
  const first = await assessPronunciation(payload(), new AbortController().signal)
  expect(first.attempt.score).toBe(7.5)
  expect(first.cached).toBe(false)
  const call = vi.mocked(fetch).mock.calls[0]!,
    options = call[1]!,
    body = JSON.parse(options.body as string)
  expect(call[0]).toBe("https://api.openai.com/v1/chat/completions")
  expect(options).toMatchObject({ method: "POST", redirect: "error", credentials: "omit" })
  expect(body).toMatchObject({ model: "gpt-audio-1.5", modalities: ["text"], store: false })
  expect(body.messages[0].content).toContain("General American")
  expect(body.messages[1].content[1].input_audio.format).toBe("wav")
  expect(JSON.stringify(first)).not.toContain("secret-pronunciation-key")
  expect(JSON.stringify(await pronunciationDB.attempts.toArray())).not.toContain(payload().wav)
  const again = await assessPronunciation(payload(), new AbortController().signal)
  expect(again.cached).toBe(true)
  expect(again.attempt.id).toBe(first.attempt.id)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(await pronunciationDB.attempts.count()).toBe(1)
  expect(finish).toHaveBeenCalledWith("complete", {
    input: 123,
    output: 456,
    cachedInput: 12,
    audioMs: 1000,
  })
})
it("invalidates cache when recording, context or credential revision changes", async () => {
  await assessPronunciation(payload(), new AbortController().signal)
  await assessPronunciation({ ...payload(), context: "Past tense" }, new AbortController().signal)
  await assessPronunciation({ ...payload(), wav: practiceWav(500) }, new AbortController().signal)
  status.mockResolvedValue({ configured: true, revision: 11 })
  credential.mockResolvedValue({ apiKey: "replacement-key", revision: 11 })
  await assessPronunciation(payload(), new AbortController().signal)
  expect(fetch).toHaveBeenCalledTimes(4)
  expect(await pronunciationDB.attempts.count()).toBe(4)
})
it("shares identical in-flight audio without one subscriber cancelling another", async () => {
  let finishFetch!: (r: Response) => void
  vi.mocked(fetch).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishFetch = resolve
      }),
  )
  const a = new AbortController(),
    b = new AbortController()
  const first = assessPronunciation(payload(), a.signal),
    rejection = first.catch((error: unknown) => error)
  const second = assessPronunciation(payload(), b.signal)
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  a.abort()
  expect(await rejection).toBeInstanceOf(Error)
  finishFetch(response())
  expect((await second).attempt.score).toBe(7.5)
  expect(await pronunciationDB.attempts.count()).toBe(1)
})
it("aborts the last subscriber and ignores a provider that returns after cancellation", async () => {
  let finishFetch!: (r: Response) => void
  vi.mocked(fetch).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishFetch = resolve
      }),
  )
  const controller = new AbortController(),
    pending = assessPronunciation(payload(), controller.signal),
    rejection = pending.catch((error: unknown) => error)
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  controller.abort()
  expect(await rejection).toBeInstanceOf(Error)
  expect(vi.mocked(fetch).mock.calls[0]![1]!.signal!.aborted).toBe(true)
  finishFetch(response())
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(await pronunciationDB.attempts.count()).toBe(0)
})
it("clear epochs and key replacement reject late feedback instead of recreating history", async () => {
  let finishFetch!: (r: Response) => void
  vi.mocked(fetch).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishFetch = resolve
      }),
  )
  const pending = assessPronunciation(payload(), new AbortController().signal),
    rejection = pending.catch((error: unknown) => error)
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  await clearPronunciationHistory()
  finishFetch(response())
  expect(await rejection).toBeInstanceOf(Error)
  expect(await pronunciationDB.attempts.count()).toBe(0)
  const other = assessPronunciation(payload(), new AbortController().signal),
    otherReject = other.catch((error: unknown) => error)
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  status.mockResolvedValue({ configured: true, revision: 12 })
  finishFetch(response())
  expect(await otherReject).toMatchObject({ message: expect.stringMatching(/đã đổi/) })
  expect(await pronunciationDB.attempts.count()).toBe(0)
})
it("does not invent a grade for malformed output, truncation, unknown word indices or provider errors", async () => {
  const bad = practiceFeedback()
  bad.findings[0]!.wordEnd = 1000
  for (const badResponse of [
    response(bad),
    new Response(JSON.stringify({ secret: "provider-sensitive" })),
    new Response("provider-sensitive", { status: 500 }),
  ]) {
    vi.mocked(fetch).mockResolvedValueOnce(badResponse)
    await expect(assessPronunciation(payload(), new AbortController().signal)).rejects.not.toThrow(
      /provider-sensitive/,
    )
    expect(await pronunciationDB.attempts.count()).toBe(0)
  }
})
it("records quality retries with no numerical score and refuses absent credentials before a paid call", async () => {
  const retry = practiceFeedback()
  retry.verdict = "retry"
  retry.reason = "noisy"
  retry.findings = []
  retry.confidence = "low"
  for (const key of criterionKeys) retry.criteria[key].score = null
  vi.mocked(fetch).mockResolvedValueOnce(response(retry))
  const result = await assessPronunciation(payload(), new AbortController().signal)
  expect(result.attempt.score).toBeNull()
  expect(await pronunciationDB.attempts.count()).toBe(1)
  status.mockResolvedValue({ configured: false, revision: 11 })
  await expect(assessPronunciation(payload(), new AbortController().signal)).rejects.toThrow(
    /khóa OpenAI/,
  )
  expect(fetch).toHaveBeenCalledTimes(1)
})
it("grades a single-word provider response with redundant sentence scores using one paid call", async () => {
  const result = await assessPronunciation(
    { ...payload(), text: "read" },
    new AbortController().signal,
  )
  expect(result.attempt.score).toBe(7.5)
  expect(result.attempt.feedback.criteria.rhythm.score).toBeNull()
  expect(result.attempt.feedback.criteria.fluency.score).toBeNull()
  const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)
  expect(body.messages[0].content).toContain("ONE ISOLATED WORD")
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(await pronunciationDB.attempts.count()).toBe(1)
})
it("returns an unscored retry for low-confidence assessed audio instead of the generic format error", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response({ ...practiceFeedback(), confidence: "low" }))
  const result = await assessPronunciation(
    { ...payload(), text: "read" },
    new AbortController().signal,
  )
  expect(result.attempt.score).toBeNull()
  expect(result.attempt.feedback.verdict).toBe("retry")
  expect(result.attempt.feedback.findings).toEqual([])
  expect(fetch).toHaveBeenCalledTimes(1)
})
