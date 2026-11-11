// @vitest-environment jsdom
import type { ReactNode } from "react"
import { TextEncoder as UTF8Encoder, TextDecoder as UTF8Decoder } from "node:util"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react"
import { Provider, createStore } from "jotai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DownloadTTSButton } from "@/components/ui/selection-popover/download-tts-button"
import { configAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { splitTextByUtf8Bytes } from "@/utils/server/edge-tts/chunk"
import { openAIAudioKey } from "@/utils/tts-playback/openai-audio-cache"
import { wavFixture } from "@/utils/vocabulary/__tests__/fixtures"
import { isMp3 } from "@/utils/vocabulary/audio"
import { useOpenAITTSDownload } from "../use-openai-tts-download"

const { send, stream, toast } = vi.hoisted(() => ({
  send: vi.fn<(...args: any[]) => any>(),
  stream: vi.fn<(...args: any[]) => any>(),
  toast: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("@/utils/message", () => ({ sendMessage: send }))
vi.mock("@/utils/content-script/port-streaming", () => ({ createPortStreamPromise: stream }))
vi.mock("@/components/ui/base-ui/toast", () => ({ toastManager: { add: toast } }))
let revision = 1
let configured = true
const openai = { ...structuredClone(DEFAULT_CONFIG.tts), provider: "openai" as const }
const audio = () => ({
  audioBase64: Buffer.from(wavFixture()).toString("base64"),
  contentType: "audio/wav",
})
function setup() {
  const client = new QueryClient(),
    store = createStore()
  store.set(configAtom, { ...DEFAULT_CONFIG, tts: openai })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <Provider store={store}>{children}</Provider>
    </QueryClientProvider>
  )
  return { client, store, wrapper }
}
beforeEach(() => {
  vi.stubGlobal("TextEncoder", UTF8Encoder)
  vi.stubGlobal("TextDecoder", UTF8Decoder)
  vi.clearAllMocks()
  revision = 1
  configured = true
  send.mockImplementation(async (name) =>
    name === "getOpenAIKeyStatus" ? { configured, revision } : { saved: true },
  )
  stream.mockImplementation(async () => audio())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("explicit OpenAI MP3 button", () => {
  it("offers OpenAI export even for legacy settings, without calling or downloading on mount", () => {
    const { wrapper, store } = setup()
    const view = render(<DownloadTTSButton text="hello" showLabel />, { wrapper })
    expect(screen.getByRole("button").getAttribute("data-tts-download")).not.toBeNull()
    expect(stream).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    act(() =>
      store.set(configAtom, { ...DEFAULT_CONFIG, tts: { ...openai, provider: "microsoft" } }),
    )
    expect(view.container.querySelector("button")).not.toBeNull()
  })
  it("exports a full long passage including uncached chunks, then reuses all audio without claiming playback", async () => {
    const { wrapper, client } = setup(),
      text = "A Vietnamese passage. ".repeat(140),
      chunks = splitTextByUtf8Bytes(text.trim(), 1800)
    client.setQueryData(openAIAudioKey(chunks[0]!, openai.openai, 1), audio())
    const { result } = renderHook(() => useOpenAITTSDownload(text), { wrapper })
    await act(() => result.current.download())
    expect(stream).toHaveBeenCalledTimes(chunks.length - 1)
    expect(stream.mock.calls.map(([, payload]) => payload.text)).toEqual(chunks.slice(1))
    expect(stream.mock.calls.every(([port]) => port === "openai-tts-file")).toBe(true)
    const saved = send.mock.calls.find(([name]) => name === "downloadOpenAITTSMp3")!
    expect(isMp3(new Uint8Array(Buffer.from(saved[1].audioBase64, "base64")))).toBe(true)
    await act(() => result.current.download())
    expect(stream).toHaveBeenCalledTimes(chunks.length - 1)
    expect(send.mock.calls.some(([name]) => /ttsPlayback/.test(name))).toBe(false)
    expect(result.current.progress).toBeNull()
  })
  it("cancels old text/config/unmounted requests and ignores stale completion", async () => {
    for (const change of ["text", "voice", "unmount", "cancel"] as const) {
      const { wrapper, store } = setup()
      let finish!: (value: ReturnType<typeof audio>) => void
      stream.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      const hook = renderHook(({ text }) => useOpenAITTSDownload(text), {
        wrapper,
        initialProps: { text: "first" },
      })
      let promise!: Promise<void>
      act(() => {
        promise = hook.result.current.download()
        void hook.result.current.download()
      })
      await waitFor(() => expect(finish).toBeTypeOf("function"))
      const signal = stream.mock.calls.at(-1)![2].signal as AbortSignal
      if (change === "text") hook.rerender({ text: "second" })
      if (change === "voice")
        act(() =>
          store.set(configAtom, {
            ...DEFAULT_CONFIG,
            tts: { ...openai, openai: { ...openai.openai, voice: "coral" } },
          }),
        )
      if (change === "unmount") hook.unmount()
      if (change === "cancel") act(() => hook.result.current.cancel())
      expect(signal.aborted).toBe(true)
      await act(async () => {
        finish(audio())
        await promise
      })
      hook.unmount()
    }
    expect(send.mock.calls.some(([name]) => name === "downloadOpenAITTSMp3")).toBe(false)
    expect(toast).not.toHaveBeenCalled()
  })
  it("refuses missing/changed credentials and oversized text without saving", async () => {
    const { wrapper } = setup()
    const { result, rerender } = renderHook(({ text }) => useOpenAITTSDownload(text), {
      wrapper,
      initialProps: { text: "short" },
    })
    configured = false
    await act(() => result.current.download())
    expect(stream).not.toHaveBeenCalled()
    configured = true
    stream.mockImplementationOnce(async () => {
      revision++
      return audio()
    })
    await act(() => result.current.download())
    rerender({ text: "x".repeat(20001) })
    await act(() => result.current.download())
    expect(send.mock.calls.some(([name]) => name === "downloadOpenAITTSMp3")).toBe(false)
    expect(toast).toHaveBeenCalledTimes(3)
  })
})
