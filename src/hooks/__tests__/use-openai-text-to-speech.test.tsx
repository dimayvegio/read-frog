// @vitest-environment jsdom
import type { ReactNode } from "react"
import { TextEncoder as UTF8Encoder, TextDecoder as UTF8Decoder } from "node:util"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { Provider, createStore } from "jotai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_TTS_CONFIG } from "@/utils/constants/tts"
import { useTextToSpeech } from "../use-text-to-speech"

const { send, stream, detect, toast } = vi.hoisted(() => ({
  send: vi.fn<(...args: any[]) => any>(),
  stream: vi.fn<(...args: any[]) => any>(),
  detect: vi.fn<(...args: any[]) => any>(),
  toast: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("@/utils/message", () => ({ sendMessage: send }))
vi.mock("@/utils/content-script/port-streaming", () => ({ createPortStreamPromise: stream }))
vi.mock("@/utils/content/language", () => ({ detectLanguage: detect }))
vi.mock("@/components/ui/base-ui/toast", () => ({ toastManager: { add: toast } }))

const openai = { ...structuredClone(DEFAULT_TTS_CONFIG), provider: "openai" as const }
let revision = 1
let configured = true
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <Provider store={createStore()}>{children}</Provider>
    </QueryClientProvider>
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  revision = 1
  configured = true
  detect.mockResolvedValue("eng")
  send.mockImplementation(async (name, payload) => {
    if (name === "getOpenAIKeyStatus") return { configured, revision }
    if (name === "edgeTtsSynthesize")
      return { ok: true, audioBase64: `microsoft:${payload.text}`, contentType: "audio/mpeg" }
    return { ok: true }
  })
  stream.mockImplementation(async (_name, payload) => ({
    audioBase64: `openai:${payload.text}`,
    contentType: "audio/wav",
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("OpenAI read-aloud routing and ownership", () => {
  it("uses the chosen audio snapshot and skips Microsoft language detection", async () => {
    const { result } = renderHook(() => useTextToSpeech(), { wrapper })
    await act(async () => {
      await result.current.play("PDF selected text", openai)
    })
    expect(detect).not.toHaveBeenCalled()
    expect(send.mock.calls.some(([name]) => name === "edgeTtsSynthesize")).toBe(false)
    expect(stream).toHaveBeenCalledWith(
      "openai-tts",
      { requestId: expect.any(String), text: "PDF selected text", config: openai.openai },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    const playback = send.mock.calls.find(([name]) => name === "ttsPlaybackStart")!
    expect(playback[1]).toMatchObject({
      audioBase64: "openai:PDF selected text",
      contentType: "audio/wav",
    })
    expect(send).toHaveBeenCalledWith("ttsPlaybackPrepare", { requestId: playback[1].requestId })
  })

  it("caches completed audio and invalidates by voice and credential revision", async () => {
    const { result } = renderHook(() => useTextToSpeech(), { wrapper })
    await act(async () => {
      await result.current.play("Same selection", openai)
    })
    await act(async () => {
      await result.current.play("Same selection", openai)
    })
    expect(stream).toHaveBeenCalledTimes(1)
    const changedVoice = { ...openai, openai: { ...openai.openai, voice: "coral" as const } }
    await act(async () => {
      await result.current.play("Same selection", changedVoice)
    })
    expect(stream).toHaveBeenCalledTimes(2)
    revision++
    await act(async () => {
      await result.current.play("Same selection", changedVoice)
    })
    expect(stream).toHaveBeenCalledTimes(3)
  })

  it("does not replay cached OpenAI speech after the credential is deleted", async () => {
    const { result } = renderHook(() => useTextToSpeech(), { wrapper })
    await act(async () => {
      await result.current.play("Same selection", openai)
    })
    configured = false
    await act(async () => {
      await expect(result.current.play("Same selection", openai)).rejects.toThrow(
        "Configure an OpenAI API key",
      )
    })
    expect(stream).toHaveBeenCalledTimes(1)
    expect(send.mock.calls.filter(([name]) => name === "ttsPlaybackStart")).toHaveLength(1)
  })

  it("never contacts Microsoft for legacy speech settings, and requires OpenAI credentials", async () => {
    configured = false
    const { result } = renderHook(() => useTextToSpeech(), { wrapper })
    await act(async () => {
      await expect(
        result.current.play("Legacy speech", structuredClone(DEFAULT_TTS_CONFIG)),
      ).rejects.toThrow("Configure an OpenAI API key")
    })
    expect(stream).not.toHaveBeenCalled()
    expect(send.mock.calls.some(([name]) => name === "edgeTtsSynthesize")).toBe(false)
    expect(send.mock.calls.some(([name]) => name === "getOpenAIKeyStatus")).toBe(true)
  })

  it("aborts synthesis on Stop and never starts the late audio", async () => {
    stream.mockImplementation(
      (_name, _payload, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          )
        }),
    )
    const { result } = renderHook(() => useTextToSpeech(), { wrapper })
    let pending!: Promise<void>
    act(() => {
      pending = result.current.play("Slow speech", openai)
    })
    await waitFor(() => expect(stream).toHaveBeenCalledOnce())
    await act(async () => {
      result.current.stop()
      await pending
    })
    expect(stream.mock.calls[0]![2].signal.aborted).toBe(true)
    expect(send.mock.calls.some(([name]) => name === "ttsPlaybackStart")).toBe(false)
    expect(toast).not.toHaveBeenCalled()
  })

  it("treats background cancellation by another context as interruption", async () => {
    stream.mockResolvedValue({ cancelled: true })
    const { result } = renderHook(() => useTextToSpeech(), { wrapper })
    await act(async () => {
      await result.current.play("Interrupted speech", openai)
    })
    expect(send.mock.calls.some(([name]) => name === "ttsPlaybackStart")).toBe(false)
    expect(toast).not.toHaveBeenCalled()
    expect(result.current.isFetching).toBe(false)
  })

  it("cancels its own request when the PDF window unloads", async () => {
    stream.mockImplementation(
      (_name, _payload, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          )
        }),
    )
    const { result } = renderHook(() => useTextToSpeech(), { wrapper })
    let pending!: Promise<void>
    act(() => {
      pending = result.current.play("PDF audio", openai)
    })
    await waitFor(() => expect(stream).toHaveBeenCalledOnce())
    const requestId = stream.mock.calls[0]![1].requestId
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"))
      await pending
    })
    expect(send).toHaveBeenCalledWith("ttsPlaybackStop", { requestId })
    expect(stream.mock.calls[0]![2].signal.aborted).toBe(true)
  })

  it("chunks long Unicode selections within the audio request budget, using one playback owner", async () => {
    // The shared jsdom shim measures UTF-16 code units. Use the real UTF-8
    // encoder for this transport-budget regression, as the browser does.
    vi.stubGlobal("TextEncoder", UTF8Encoder)
    const { result } = renderHook(() => useTextToSpeech(), { wrapper })
    const text = "Tiếng Việt 😀. ".repeat(300)
    await act(async () => {
      await result.current.play(text, openai)
    })
    expect(stream.mock.calls.length).toBeGreaterThan(1)
    const requests = stream.mock.calls.map((call) => call[1])
    const spokenChunks = send.mock.calls
      .filter(([name]) => name === "ttsPlaybackStart")
      .map(([, payload]) => payload.audioBase64.slice("openai:".length))
    expect(spokenChunks.join(" ").replace(/\s+/g, " ")).toBe(text.trim().replace(/\s+/g, " "))
    expect(
      requests.every(
        (request) =>
          new UTF8Decoder().decode(new UTF8Encoder().encode(request.text)) === request.text,
      ),
    ).toBe(true)
    expect(new Set(requests.map((request) => request.requestId)).size).toBe(1)
    expect(requests.every((request) => new TextEncoder().encode(request.text).length <= 1800)).toBe(
      true,
    )
  })
})
