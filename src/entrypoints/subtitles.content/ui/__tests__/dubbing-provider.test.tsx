// @vitest-environment jsdom
import type { DubbingDependencies } from "@/utils/subtitles/dubbing/controller"
import { TextEncoder as UTF8Encoder } from "node:util"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { Provider } from "jotai"
import { useLayoutEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { configAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { NoSubtitlesError } from "@/utils/subtitles/errors"
import {
  subtitlesStore,
  studySourceTrackAtom,
  translatedTrackAtom,
  subtitlesVisibleAtom,
  adPlayingAtom,
} from "../../atoms"
import { useDubbing } from "../dubbing-context"
import { DubbingProvider } from "../dubbing-provider"
const h = vi.hoisted(() => ({
  send: vi.fn<(...args: any[]) => any>(),
  stream: vi.fn<(...args: any[]) => any>(),
  unlock: vi.fn<() => Promise<void>>(),
  stop: vi.fn<() => void>(),
  deps: [] as DubbingDependencies[],
  ui: {} as any,
}))
vi.mock("@/utils/message", () => ({ sendMessage: h.send }))
vi.mock("@/utils/content-script/port-streaming", () => ({ createPortStreamPromise: h.stream }))
vi.mock("../subtitles-ui-context", () => ({ useSubtitlesUI: () => h.ui }))
vi.mock("@/utils/subtitles/dubbing/player", () => ({
  HtmlVoicePlayer: class {
    unlock = h.unlock
    destroy = () => {}
  },
  decodeDubbingAudio: () => ({ bytes: new Uint8Array(1), duration: 1 }),
}))
vi.mock("@/utils/subtitles/dubbing/controller", () => ({
  DubbingController: class {
    constructor(d: DubbingDependencies) {
      h.deps.push(d)
    }
    stop = h.stop
  },
}))
vi.mock("@/entrypoints/subtitles.content/atoms", async () => {
  const { atom, createStore } = await import("jotai")
  return {
    subtitlesStore: createStore(),
    currentVideoIdAtom: atom("video1"),
    adPlayingAtom: atom(false),
    videoLoadingAtom: atom(false),
    sourceTrackAtom: atom([]),
    studySourceTrackAtom: atom([]),
    translatedTrackAtom: atom([]),
    subtitlesVisibleAtom: atom(false),
  }
})
let ui: NonNullable<ReturnType<typeof useDubbing>>
function ReadUI() {
  const value = useDubbing()!
  useLayoutEffect(() => {
    ui = value
  }, [value])
  return <span>{value.state.message}</span>
}
function setup() {
  return render(
    <Provider store={subtitlesStore}>
      <DubbingProvider>
        <ReadUI />
      </DubbingProvider>
    </Provider>,
  )
}
beforeEach(() => {
  vi.stubGlobal("TextEncoder", UTF8Encoder)
  vi.clearAllMocks()
  h.deps.length = 0
  subtitlesStore.set(configAtom, structuredClone(DEFAULT_CONFIG))
  subtitlesStore.set(adPlayingAtom, false)
  subtitlesStore.set(subtitlesVisibleAtom, false)
  subtitlesStore.set(studySourceTrackAtom, [])
  subtitlesStore.set(translatedTrackAtom, [])
  const video = document.createElement("video")
  document.body.append(video)
  h.ui = {
    supportsDubbing: true,
    getDubbingVideoElement: () => video,
    ensureSourceTrackPublished: async () => {
      subtitlesStore.set(studySourceTrackAtom, [{ text: "Native words.", start: 0, end: 2000 }])
    },
  }
  h.unlock.mockResolvedValue()
  h.send.mockResolvedValue({ configured: true, revision: 1 })
  h.stream.mockResolvedValue({})
})
afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})
describe("explicit dubbing ownership", () => {
  it("defaults to five percent without changing persisted TTS configuration", () => {
    setup()
    expect(ui.duck).toBe(0.05)
    expect(subtitlesStore.get(configAtom)).toEqual(DEFAULT_CONFIG)
  })
  it("does not construct a player or contact OpenAI when opened or settings change", () => {
    setup()
    act(() => {
      ui.changeMode("original")
      ui.changeDuck(0.3)
    })
    expect(h.unlock).not.toHaveBeenCalled()
    expect(h.send).not.toHaveBeenCalled()
    expect(h.stream).not.toHaveBeenCalled()
  })
  it("unlocks audio in the click and reads newly loaded native CC without a React render dependency", async () => {
    setup()
    act(() => ui.changeMode("original"))
    act(() => ui.start())
    expect(h.unlock).toHaveBeenCalledOnce()
    await waitFor(() => expect(h.deps).toHaveLength(1))
    expect(h.deps[0]!.cues()[0]?.text).toBe("Native words.")
    expect(h.stream).not.toHaveBeenCalled()
    await h.deps[0]!.generate("Native words.", new AbortController().signal)
    expect(h.stream.mock.calls[0]?.[0]).toBe("openai-tts-file")
    expect(h.stream.mock.calls[0]?.[1].text).toBe("Native words.")
    expect(h.stream.mock.calls[0]?.[1]).not.toHaveProperty("url")
    expect(h.send.mock.calls.every(([name]) => name === "getOpenAIKeyStatus")).toBe(true)
  })
  it("requires explicit translated captions and never falls back to source text", async () => {
    setup()
    act(() => ui.start())
    expect(h.unlock).not.toHaveBeenCalled()
    expect(ui.state.message).toContain("Bật phụ đề")
    act(() => {
      subtitlesStore.set(subtitlesVisibleAtom, true)
      subtitlesStore.set(translatedTrackAtom, [
        { text: "Native words.", translation: "Lời dịch.", start: 0, end: 2000 },
      ])
    })
    act(() => ui.start())
    await waitFor(() => expect(h.deps).toHaveLength(1))
    expect(h.deps[0]!.cues()[0]?.text).toBe("Lời dịch.")
  })
  it("stops on ads/config changes and does not reuse old audio", async () => {
    setup()
    act(() => ui.changeMode("original"))
    act(() => ui.start())
    await waitFor(() => expect(h.deps).toHaveLength(1))
    act(() => subtitlesStore.set(adPlayingAtom, true))
    expect(h.stop).toHaveBeenCalled()
    expect(h.deps[0]!.valid()).toBe(false)
    expect(ui.state.active).toBe(false)
    expect(h.stream).not.toHaveBeenCalled()
  })
  it("rejects credentials changed while synthesis is awaiting output", async () => {
    setup()
    act(() => ui.changeMode("original"))
    act(() => ui.start())
    await waitFor(() => expect(h.deps).toHaveLength(1))
    h.send
      .mockResolvedValueOnce({ configured: true, revision: 1 })
      .mockResolvedValue({ configured: true, revision: 2 })
    await expect(
      h.deps[0]!.generate("Native words.", new AbortController().signal),
    ).rejects.toThrow("Khóa OpenAI đã đổi")
  })
  it("explains native SOFT/CC without paid fallback when no captions exist", async () => {
    h.ui.ensureSourceTrackPublished = async () => {
      throw new NoSubtitlesError()
    }
    setup()
    act(() => ui.changeMode("original"))
    act(() => ui.start())
    await waitFor(() => expect(ui.state.message).toContain("SOFT"))
    expect(h.stream).not.toHaveBeenCalled()
    expect(h.deps).toHaveLength(0)
  })
  it("ignores canceled initialization and never starts a late controller", async () => {
    let finish!: (v: unknown) => void
    h.send.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    setup()
    act(() => ui.changeMode("original"))
    act(() => ui.start())
    await waitFor(() => expect(h.send).toHaveBeenCalled())
    act(() => ui.stop())
    await act(async () => finish({ configured: true, revision: 1 }))
    expect(h.deps).toHaveLength(0)
    expect(h.stream).not.toHaveBeenCalled()
  })
})
