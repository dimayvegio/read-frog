import type {
  BackgroundStructuredObjectStreamSnapshot,
  BackgroundTextStreamSnapshot,
} from "@/types/background-stream"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_OPENAI_CONFIG } from "@/types/config/openai"
import { ProviderSetupError } from "@/utils/providers/provider-setup-error"

const streamTextMock = vi.fn<(...args: any[]) => any>()
const outputObjectMock = vi.fn<(...args: any[]) => any>((value) => value)
const resolveExecutionMock = vi.fn<(...args: any[]) => any>()
const loggerErrorMock = vi.fn<(...args: any[]) => any>()
const parsePartialJsonMock = vi.fn<(...args: any[]) => any>(async (text: string | undefined) => {
  if (!text) return { state: "undefined-input", value: undefined }
  try {
    return { state: "successful-parse", value: JSON.parse(text) }
  } catch {
    try {
      return { state: "repaired-parse", value: JSON.parse(`${text}}`) }
    } catch {
      return { state: "failed-parse", value: undefined }
    }
  }
})
vi.mock("ai", () => ({
  streamText: streamTextMock,
  parsePartialJson: parsePartialJsonMock,
  Output: { object: outputObjectMock },
}))
vi.mock("../openai-runtime", () => ({ resolveOpenAIExecution: resolveExecutionMock }))
vi.mock("@/utils/logger", () => ({ logger: { error: loggerErrorMock } }))

const payload = {
  providerKind: "local",
  providerId: "openai-default",
  providerConfig: DEFAULT_OPENAI_CONFIG,
  instructions: "Translate",
  prompt: "sample",
} as const
function parts(values: unknown[]) {
  return {
    stream: (async function* () {
      for (const value of values) yield value
    })(),
  }
}
function createMockPort(name: string) {
  let messageListener: ((message: unknown) => void | Promise<void>) | undefined
  let disconnectListener: (() => void) | undefined

  const postMessage = vi.fn<(...args: any[]) => any>()
  const disconnect = vi.fn<(...args: any[]) => any>()

  const port = {
    name,
    postMessage,
    disconnect,
    onMessage: {
      addListener: vi.fn<(...args: any[]) => any>(
        (listener: (message: unknown) => void | Promise<void>) => {
          messageListener = listener
        },
      ),
      removeListener: vi.fn<(...args: any[]) => any>(
        (listener: (message: unknown) => void | Promise<void>) => {
          if (messageListener === listener) {
            messageListener = undefined
          }
        },
      ),
    },
    onDisconnect: {
      addListener: vi.fn<(...args: any[]) => any>((listener: () => void) => {
        disconnectListener = listener
      }),
      removeListener: vi.fn<(...args: any[]) => any>((listener: () => void) => {
        if (disconnectListener === listener) {
          disconnectListener = undefined
        }
      }),
    },
  }

  return {
    port,
    postMessage,
    disconnect,
    async emitMessage(message: unknown) {
      if (!messageListener) {
        throw new Error("Port message listener is not registered")
      }
      await messageListener(message)
    },
    emitDisconnect() {
      disconnectListener?.()
    },
  }
}

describe("background-stream", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveExecutionMock.mockResolvedValue({
      model: "snapshot-model",
      params: { reasoning: "low", temperature: 0.3 },
    })
  })

  it("uses the supplied local snapshot for both the model and its generation settings", async () => {
    const snapshot = { ...DEFAULT_OPENAI_CONFIG, reasoning: "low" as const, temperature: 0.3 }
    streamTextMock.mockReturnValue(
      parts([
        { type: "text-delta", text: "answer" },
        { type: "finish", finishReason: "stop" },
      ]),
    )
    const { runStreamTextInBackground } = await import("../background-stream")
    expect((await runStreamTextInBackground({ ...payload, providerConfig: snapshot })).output).toBe(
      "answer",
    )
    expect(resolveExecutionMock).toHaveBeenCalledWith(snapshot, { signal: undefined })
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "snapshot-model",
        reasoning: "low",
        temperature: 0.3,
        maxRetries: 0,
      }),
    )
    expect(streamTextMock.mock.calls[0]![0]).not.toHaveProperty("providerConfig")
  })

  it("streams text via background stream port handler with request IDs", async () => {
    streamTextMock.mockReturnValue(
      parts([
        { type: "text-delta", text: "Hello" },
        { type: "text-delta", text: " world" },
        { type: "finish", finishReason: "stop" },
      ]),
    )
    const { handleStreamTextPort } = await import("../background-stream")
    const port = createMockPort("stream-text")
    handleStreamTextPort(port.port as never)
    await port.emitMessage({ type: "start", streamRequestId: "req-text", payload })
    expect(port.postMessage.mock.calls.map(([value]) => value.type)).toEqual([
      "chunk",
      "chunk",
      "done",
    ])
    expect(
      port.postMessage.mock.calls.every(([value]) => value.streamRequestId === "req-text"),
    ).toBe(true)
    expect(port.postMessage).toHaveBeenLastCalledWith({
      type: "done",
      streamRequestId: "req-text",
      data: { output: "Hello world", thinking: { status: "complete", text: "" } },
    })
    expect(port.disconnect).toHaveBeenCalledOnce()
  })

  it("streams structured partial output and validates final output with the captured snapshot", async () => {
    streamTextMock.mockReturnValue(
      parts([
        { type: "text-delta", text: '{"score":97' },
        { type: "text-delta", text: ',"summary":"sample"}' },
        { type: "finish", finishReason: "stop" },
      ]),
    )
    const chunks: BackgroundStructuredObjectStreamSnapshot[] = []
    const { runStructuredObjectStreamInBackground } = await import("../background-stream")
    const result = await runStructuredObjectStreamInBackground(
      {
        ...payload,
        outputSchema: [
          { name: "score", type: "number" },
          { name: "summary", type: "string" },
        ],
      },
      { onChunk: (chunk) => chunks.push(chunk) },
    )
    expect(chunks.map((chunk) => chunk.output)).toEqual([
      { score: 97 },
      { score: 97, summary: "sample" },
    ])
    expect(result.output).toEqual({ score: 97, summary: "sample" })
    expect(resolveExecutionMock).toHaveBeenCalledWith(DEFAULT_OPENAI_CONFIG, { signal: undefined })
    const schema = outputObjectMock.mock.calls[0]![0].schema
    expect(schema.safeParse({ score: "wrong", summary: "sample" }).success).toBe(false)
    expect(schema.safeParse({ score: null, summary: null }).success).toBe(true)
  })

  it.each(["text", "structured"])(
    "rejects %s streams without finish or with truncated output",
    async (kind) => {
      const { runStreamTextInBackground, runStructuredObjectStreamInBackground } =
        await import("../background-stream")
      for (const finish of [false, true]) {
        streamTextMock.mockReturnValue(
          parts([
            { type: "text-delta", text: kind === "text" ? "partial" : '{"score":1}' },
            ...(finish ? [{ type: "finish", finishReason: "length" }] : []),
          ]),
        )
        const run =
          kind === "text"
            ? runStreamTextInBackground(payload)
            : runStructuredObjectStreamInBackground({
                ...payload,
                outputSchema: [{ name: "score", type: "number" }],
              })
        await expect(run).rejects.toThrow(finish ? "length limit" : "Invalid AI stream response")
      }
    },
  )

  it("ends and reopens thinking as reasoning and output interleave", async () => {
    streamTextMock.mockReturnValue(
      parts([
        { type: "start" },
        { type: "text-delta", text: "Hola" },
        { type: "reasoning-delta", text: "second guess" },
        { type: "text-delta", text: " mundo" },
        { type: "finish", finishReason: "stop" },
      ]),
    )
    const chunks: BackgroundTextStreamSnapshot[] = []
    const { runStreamTextInBackground } = await import("../background-stream")
    await runStreamTextInBackground(payload, { onChunk: (chunk) => chunks.push(chunk) })
    expect(chunks.map((chunk) => chunk.thinking)).toEqual([
      { status: "complete", text: "" },
      { status: "thinking", text: "second guess" },
      { status: "complete", text: "second guess" },
    ])
  })

  it.each([
    { ...payload, providerKind: "system", providerId: "openai-default" },
    { ...payload, providerId: "other-id" },
    { ...payload, providerConfig: undefined },
    { ...payload, providerConfig: { ...DEFAULT_OPENAI_CONFIG, apiKey: "private-sentinel" } },
    { ...payload, temperature: 0.9 },
    { ...payload, headers: { Authorization: "private-sentinel" } },
  ])("rejects legacy routes and detached overrides before executor access", async (input) => {
    const { handleStreamTextPort } = await import("../background-stream")
    const port = createMockPort("stream-text")
    handleStreamTextPort(port.port as never)
    await port.emitMessage({ type: "start", streamRequestId: "invalid", payload: input })
    expect(resolveExecutionMock).not.toHaveBeenCalled()
    expect(port.postMessage).toHaveBeenCalledWith({
      type: "error",
      streamRequestId: "invalid",
      error: { message: "Invalid stream start payload" },
    })
    expect(JSON.stringify(port.postMessage.mock.calls)).not.toContain("private-sentinel")
  })

  it("rejects duplicate structured field names before executor access", async () => {
    const { handleStreamStructuredObjectPort } = await import("../background-stream")
    const port = createMockPort("stream-structured-object")
    handleStreamStructuredObjectPort(port.port as never)
    await port.emitMessage({
      type: "start",
      streamRequestId: "duplicate",
      payload: {
        ...payload,
        outputSchema: [
          { name: "x", type: "string" },
          { name: "x", type: "number" },
        ],
      },
    })
    expect(resolveExecutionMock).not.toHaveBeenCalled()
    expect(port.disconnect).toHaveBeenCalledOnce()
  })

  it("prefers stream onError root cause and posts one sanitized error without done", async () => {
    streamTextMock.mockImplementation((options) => {
      options.onError({ error: Object.assign(new Error("private-sentinel"), { statusCode: 401 }) })
      return parts([])
    })
    const { handleStreamTextPort } = await import("../background-stream")
    const port = createMockPort("stream-text")
    handleStreamTextPort(port.port as never)
    await port.emitMessage({ type: "start", streamRequestId: "error", payload })
    expect(port.postMessage).toHaveBeenCalledOnce()
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        error: { message: expect.stringContaining("OpenAI rejected") },
      }),
    )
    expect(JSON.stringify(port.postMessage.mock.calls)).not.toContain("private-sentinel")
    expect(JSON.stringify(loggerErrorMock.mock.calls)).not.toContain("private-sentinel")
  })

  it("keeps outer catch as fallback for pre-stream setup errors", async () => {
    resolveExecutionMock.mockRejectedValueOnce(new ProviderSetupError("Model is undefined"))
    const { handleStreamTextPort } = await import("../background-stream")
    const port = createMockPort("stream-text")
    handleStreamTextPort(port.port as never)
    await port.emitMessage({ type: "start", streamRequestId: "setup", payload })
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        error: { message: expect.stringContaining("Configure an OpenAI") },
      }),
    )
    expect(port.disconnect).toHaveBeenCalledOnce()
  })

  it("treats stream port disconnect aborts as expected cancellation", async () => {
    let signal: AbortSignal | undefined
    streamTextMock.mockImplementation((options) => {
      signal = options.abortSignal
      return {
        stream: (async function* () {
          await new Promise<void>((_resolve, reject) =>
            options.abortSignal.addEventListener("abort", () =>
              reject(new DOMException("cancelled", "AbortError")),
            ),
          )
          yield { type: "finish", finishReason: "stop" }
        })(),
      }
    })
    const { handleStreamTextPort } = await import("../background-stream")
    const port = createMockPort("stream-text")
    handleStreamTextPort(port.port as never)
    const start = port.emitMessage({ type: "start", streamRequestId: "abort", payload })
    await new Promise((resolve) => setTimeout(resolve, 0))
    port.emitDisconnect()
    await start
    expect(signal?.aborted).toBe(true)
    expect(loggerErrorMock).not.toHaveBeenCalled()
    expect(port.postMessage).not.toHaveBeenCalled()
  })

  it("ignores pre-start heartbeat and disconnects malformed envelopes without an ID", async () => {
    const { handleStreamTextPort, dispatchBackgroundStreamPort } =
      await import("../background-stream")
    const port = createMockPort("stream-text")
    handleStreamTextPort(port.port as never)
    await port.emitMessage({ type: "ping", streamRequestId: "ping" })
    expect(port.postMessage).not.toHaveBeenCalled()
    expect(port.disconnect).not.toHaveBeenCalled()
    await port.emitMessage({ type: "start", payload })
    expect(port.postMessage).not.toHaveBeenCalled()
    expect(port.disconnect).toHaveBeenCalledOnce()
    expect(dispatchBackgroundStreamPort({ name: "stream-note-suggestion" } as never)).toBe(false)
  })
})
