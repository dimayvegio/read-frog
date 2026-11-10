import { TextDecoder, TextEncoder } from "node:util"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { encodeAudioChunk, type TranscriptionStart } from "@/utils/audio-transcription/schema"
import {
  executeTranscription,
  handleTranscriptionPort,
  trustedTranscription,
} from "../audio-transcription"
const { credential, status, finish } = vi.hoisted(() => ({
  credential: vi.fn<(...args: any[]) => any>(),
  status: vi.fn<(...args: any[]) => any>(),
  finish: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("../openai-credentials", () => ({
  readOpenAIExecutionCredential: credential,
  readOpenAIKeyStatus: status,
}))
vi.mock("../config", () => ({ ensureInitializedConfig: async () => ({}) }))
vi.mock("../tab-audio", () => ({ openTranscriptionPage: vi.fn<(...args: any[]) => any>() }))
vi.mock("../usage", () => ({ beginUsage: async () => ({ finish }) }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("TextEncoder", TextEncoder)
  vi.stubGlobal("TextDecoder", TextDecoder)
  credential.mockResolvedValue({ apiKey: "transcription-private-sentinel", revision: 4 })
  status.mockResolvedValue({ configured: true, revision: 4 })
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            text: "Hello",
            languages: [{ code: "en" }],
            usage: { type: "duration", seconds: 10 },
          }),
        ),
    ),
  )
})
afterEach(() => vi.unstubAllGlobals())
const metadata = (): TranscriptionStart => ({
  type: "start",
  id: crypto.randomUUID(),
  format: "wav",
  size: 16,
  languages: ["en", "zh", "ja", "vi"],
  prompt: "Terms",
})
const bytes = () => new TextEncoder().encode("RIFFxxxxWAVEdata")
const sender = () => ({
  id: browser.runtime.id,
  url: browser.runtime.getURL("/audio-transcription.html"),
  frameId: 0,
})
it("allows only the owned top-frame transcription page", () => {
  const good = sender()
  expect(trustedTranscription(good)).toBe(true)
  for (const patch of [
    { id: "other" },
    { url: "https://test/audio-transcription.html" },
    { url: browser.runtime.getURL("/popup.html") },
    { frameId: 1 },
  ])
    expect(trustedTranscription({ ...good, ...patch })).toBe(false)
})
it("uploads a bounded generic filename, multilingual hints and private credential only to the fixed endpoint", async () => {
  const parts = [bytes()]
  const result = await executeTranscription(
    metadata(),
    parts,
    4,
    new AbortController().signal,
    () => {},
  )
  const fetcher = vi.mocked(fetch),
    [url, init] = fetcher.mock.calls[0]!
  expect(url).toBe("https://api.openai.com/v1/audio/transcriptions")
  expect(init!.credentials).toBe("omit")
  expect(init!.redirect).toBe("error")
  expect(init!.headers).toEqual({ Authorization: "Bearer transcription-private-sentinel" })
  const body = init!.body as FormData
  expect((body.get("file") as File).name).toBe("audio.wav")
  expect(body.get("model")).toBe("gpt-transcribe")
  expect(body.get("stream")).toBe("true")
  expect(body.getAll("languages[]")).toEqual(["en", "zh", "ja", "vi"])
  expect(parts).toHaveLength(0)
  expect(result.text).toBe("Hello")
  expect(finish).toHaveBeenCalledWith("complete", { input: null, output: null, audioMs: 10000 })
})
it("does not send after credential change, does not retry a failed paid call, and hides provider bodies", async () => {
  await expect(
    executeTranscription(metadata(), [bytes()], 3, new AbortController().signal, () => {}),
  ).rejects.toThrow(/đổi/)
  expect(fetch).not.toHaveBeenCalled()
  vi.mocked(fetch).mockResolvedValue(new Response("provider-secret-diagnostic", { status: 429 }))
  await expect(
    executeTranscription(metadata(), [bytes()], 4, new AbortController().signal, () => {}),
  ).rejects.toThrow(/giới hạn/)
  expect(fetch).toHaveBeenCalledTimes(1)
})
it("rejects late results after key replacement and preserves actual usage", async () => {
  status.mockResolvedValue({ configured: true, revision: 5 })
  await expect(
    executeTranscription(metadata(), [bytes()], 4, new AbortController().signal, () => {}),
  ).rejects.toThrow(/đổi/)
  expect(finish).toHaveBeenCalledWith("complete", expect.objectContaining({ audioMs: 10000 }))
})
it("uses the explicitly selected timed model with one private upload and real segment timestamps", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        text: "Hello",
        duration: 10,
        segments: [{ start: 2.5, end: 4.75, text: "Hello" }],
        usage: { type: "duration", seconds: 10 },
      }),
    ),
  )
  const result = await executeTranscription(
    { ...metadata(), languages: ["en"], output: "subtitles" },
    [bytes()],
    4,
    new AbortController().signal,
    () => {},
  )
  const body = vi.mocked(fetch).mock.calls[0]![1]!.body as FormData
  expect(body.get("model")).toBe("whisper-1")
  expect(body.get("response_format")).toBe("verbose_json")
  expect(body.getAll("timestamp_granularities[]")).toEqual(["segment"])
  expect(body.get("stream")).toBeNull()
  expect(body.get("language")).toBe("en")
  expect(body.get("languages[]")).toBeNull()
  expect((body.get("file") as File).name).toBe("audio.wav")
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(result.segments).toEqual([{ start: 2.5, end: 4.75, text: "Hello" }])
})
it("does not send an unsupported multi-language hint to the timed model or repair missing timestamp data", async () => {
  await expect(
    executeTranscription(
      { ...metadata(), output: "subtitles" },
      [bytes()],
      4,
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toThrow(/ngôn ngữ/)
  expect(fetch).not.toHaveBeenCalled()
  await expect(
    executeTranscription(
      { ...metadata(), languages: [], output: "subtitles" },
      [bytes()],
      4,
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toThrow(/Chưa tạo SRT/)
  expect(fetch).toHaveBeenCalledTimes(1)
})
function port() {
  const listeners = new Set<(data: unknown) => void | Promise<void>>(),
    disconnected = new Set<() => void>()
  const result = {
    sender: sender(),
    postMessage: vi.fn<(...args: any[]) => any>(),
    disconnect: vi.fn<(...args: any[]) => any>(),
    onMessage: {
      addListener: (fn: any) => listeners.add(fn),
      removeListener: (fn: any) => listeners.delete(fn),
    },
    onDisconnect: {
      addListener: (fn: any) => disconnected.add(fn),
      removeListener: (fn: any) => disconnected.delete(fn),
    },
  }
  return {
    result,
    send: async (data: unknown) => {
      for (const fn of [...listeners]) await fn(data)
    },
    close: () => {
      for (const fn of [...disconnected]) fn()
    },
  }
}
it("commits only exact ordered bytes; partial or wrong-header files never call OpenAI", async () => {
  for (const invalid of ["incomplete", "wrong-header", "wrong-index"]) {
    const p = port()
    handleTranscriptionPort(p.result as any)
    await p.send(metadata())
    if (invalid === "incomplete") await p.send({ type: "commit" })
    else
      await p.send({
        type: "chunk",
        index: invalid === "wrong-index" ? 1 : 0,
        data: encodeAudioChunk(new Uint8Array(16)),
      })
    expect(p.result.disconnect).toHaveBeenCalled()
  }
  expect(fetch).not.toHaveBeenCalled()
  const p = port()
  handleTranscriptionPort(p.result as any)
  await p.send(metadata())
  await p.send({ type: "chunk", index: 0, data: encodeAudioChunk(bytes()) })
  await p.send({ type: "commit" })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(p.result.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "done" }))
})
