import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { DEFAULT_OPENAI_TTS_CONFIG } from "@/types/openai-tts"
import { pcmToWav, synthesizeOpenAITTS } from "../openai-tts"
import { beginTTSRequest } from "../tts-request"

const { credential } = vi.hoisted(() => ({ credential: vi.fn<(...args: any[]) => any>() }))
vi.mock("../openai-credentials", () => ({ readOpenAIExecutionCredential: credential }))
vi.mock("../config", () => ({ ensureInitializedConfig: async () => {} }))

class FakeSocket extends EventTarget {
  static OPEN = 1
  static instances: FakeSocket[] = []
  static respond: (socket: FakeSocket) => void = () => {}
  readonly sent: any[] = []
  readyState = 0
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    super()
    FakeSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = 1
      this.receive({ type: "session.created" })
    })
  }
  send(text: string) {
    const value = JSON.parse(text)
    this.sent.push(value)
    if (value.type === "response.create") FakeSocket.respond(this)
  }
  receive(value: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) }))
  }
  close() {
    this.readyState = 3
    this.dispatchEvent(new Event("close"))
  }
}
let sequence = 0
let requestId = ""
const payload = (model: "gpt-realtime-2.1-mini" | "gpt-4o-mini-tts" = "gpt-realtime-2.1-mini") => ({
  requestId,
  text: "Read this exact selection.",
  config: { ...DEFAULT_OPENAI_TTS_CONFIG, model },
})

beforeEach(() => {
  requestId = `speech-${++sequence}`
  beginTTSRequest(requestId)
  credential.mockReset().mockResolvedValue({ apiKey: "private-tts-sentinel", revision: 1 })
  FakeSocket.instances = []
  FakeSocket.respond = (socket) => {
    socket.receive({ type: "response.output_audio.delta", delta: "AAABAA==" })
    socket.receive({ type: "response.done", response: { status: "completed" } })
  }
  vi.stubGlobal("WebSocket", FakeSocket)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("private OpenAI speech transport", () => {
  it("uses the legacy Speech endpoint with a private credential and the supplied audio snapshot", async () => {
    const wav = pcmToWav([new Uint8Array([0, 0, 1, 0])])
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array(wav)))
    const input = payload("gpt-4o-mini-tts")
    input.config.speed = 1.25
    input.config.instructions = "Speak warmly."
    const result = await synthesizeOpenAITTS(input)
    expect(result.contentType).toBe("audio/wav")
    const [url, options] = fetch.mock.calls[0]!
    expect(url).toBe("https://api.openai.com/v1/audio/speech")
    expect(options).toMatchObject({
      method: "POST",
      credentials: "omit",
      redirect: "error",
      headers: { Authorization: "Bearer private-tts-sentinel" },
    })
    if (typeof options?.body !== "string") throw new Error("Missing serialized speech body")
    expect(JSON.parse(options.body)).toEqual({
      model: "gpt-4o-mini-tts",
      voice: "marin",
      speed: 1.25,
      instructions: "Speak warmly.",
      input: input.text,
      response_format: "wav",
    })
    expect(JSON.stringify(result)).not.toContain("private-tts-sentinel")
  })

  it("mints an ephemeral secret and reads Realtime PCM using an audio-only session", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ value: "ek_fixture" })))
    const result = await synthesizeOpenAITTS(payload())
    const [url, options] = fetch.mock.calls[0]!
    expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets")
    if (typeof options?.body !== "string") throw new Error("Missing serialized session body")
    expect(JSON.parse(options.body)).toMatchObject({
      expires_after: { seconds: 60 },
      session: {
        type: "realtime",
        model: "gpt-realtime-2.1-mini",
        output_modalities: ["audio"],
        tools: [],
        audio: {
          input: { turn_detection: null },
          output: { voice: "marin", speed: 1, format: { type: "audio/pcm", rate: 24000 } },
        },
      },
    })
    const socket = FakeSocket.instances[0]!
    expect(socket.url).toBe("wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini")
    expect(socket.protocols).toEqual(["realtime", "openai-insecure-api-key.ek_fixture"])
    expect(socket.sent[0]).toMatchObject({
      type: "response.create",
      response: {
        conversation: "none",
        tools: [],
        output_modalities: ["audio"],
        input: [{ role: "user", content: [{ type: "input_text", text: payload().text }] }],
      },
    })
    const wav = Uint8Array.from(atob(result.audioBase64), (char) => char.charCodeAt(0))
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF")
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(24000)
    expect(wav.slice(44)).toEqual(new Uint8Array([0, 0, 1, 0]))
    expect(socket.readyState).toBe(3)
    expect(JSON.stringify(result)).not.toMatch(/ek_fixture|private-tts-sentinel/)
  })

  it("does not fetch when the key is missing or credentials resolve after cancellation", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
    credential.mockResolvedValueOnce({ apiKey: null, revision: 1 })
    await expect(synthesizeOpenAITTS(payload())).rejects.toThrow("Configure an OpenAI API key")
    const controller = new AbortController()
    credential.mockImplementationOnce(async () => {
      controller.abort()
      return { apiKey: "late-private-key", revision: 1 }
    })
    await expect(synthesizeOpenAITTS(payload(), { signal: controller.signal })).rejects.toThrow(
      "aborted",
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it("cancels an in-flight session when another context starts reading", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ value: "ek_fixture" })),
    )
    FakeSocket.respond = () => {}
    const pending = synthesizeOpenAITTS(payload())
    await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(1))
    beginTTSRequest("another-context")
    await expect(pending).rejects.toThrow("aborted")
    expect(FakeSocket.instances[0]!.sent).toContainEqual({ type: "response.cancel" })
    expect(FakeSocket.instances[0]!.readyState).toBe(3)
  })

  it("returns only a status code for HTTP failures, without the server's body or credential", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("private-echoed-response", { status: 429 }),
    )
    await expect(synthesizeOpenAITTS(payload("gpt-4o-mini-tts"))).rejects.toMatchObject({
      statusCode: 429,
      message: "OpenAI speech request failed",
    })
  })

  it("rejects incomplete or empty Realtime output", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ value: "ek_fixture" })),
    )
    FakeSocket.respond = (socket) =>
      socket.receive({ type: "response.done", response: { status: "incomplete" } })
    await expect(synthesizeOpenAITTS(payload())).rejects.toThrow("did not complete")
    FakeSocket.respond = (socket) =>
      socket.receive({ type: "response.done", response: { status: "completed" } })
    await expect(synthesizeOpenAITTS(payload())).rejects.toThrow("PCM audio length")
  })

  it("rejects oversized and non-audio HTTP responses", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("", { headers: { "content-length": String(9 * 1024 * 1024) } }),
      )
      .mockResolvedValueOnce(new Response("not a wav"))
    await expect(synthesizeOpenAITTS(payload("gpt-4o-mini-tts"))).rejects.toThrow("size limit")
    await expect(synthesizeOpenAITTS(payload("gpt-4o-mini-tts"))).rejects.toThrow("WAV audio")
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each([
    { apiKey: "injected" },
    { url: "https://proxy.invalid" },
    { text: "a".repeat(4001) },
    { config: { ...DEFAULT_OPENAI_TTS_CONFIG, baseURL: "https://proxy.invalid" } },
    { config: { ...DEFAULT_OPENAI_TTS_CONFIG, voice: "en-US-AndrewMultilingualNeural" } },
    { config: { ...DEFAULT_OPENAI_TTS_CONFIG, speed: 4 } },
  ])(
    "rejects detached credentials, destinations, invalid voices and input limits before network",
    async (overrides) => {
      const fetch = vi.spyOn(globalThis, "fetch")
      await expect(synthesizeOpenAITTS({ ...payload(), ...overrides })).rejects.toBeInstanceOf(
        z.ZodError,
      )
      expect(fetch).not.toHaveBeenCalled()
      expect(credential).not.toHaveBeenCalled()
    },
  )
})
