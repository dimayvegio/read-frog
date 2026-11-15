// @vitest-environment jsdom
import { TextEncoder, TextDecoder } from "node:util"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { Provider } from "jotai"
import { useLayoutEffect } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { configAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { parseSmartProfile } from "@/utils/subtitles/dubbing/smart"
import { subtitlesStore } from "../../atoms"
import { useSmartVideo } from "../smart-video-context"
import { SmartVideoProvider } from "../smart-video-provider"
const h = vi.hoisted(() => ({
  send: vi.fn<(...args: any[]) => any>(),
  stream: vi.fn<(...args: any[]) => any>(),
  audio: vi.fn<(...args: any[]) => any>(),
  ui: {} as any,
}))
vi.mock("@/utils/message", () => ({ sendMessage: h.send }))
vi.mock("@/utils/content-script/port-streaming", () => ({ createPortStreamPromise: h.stream }))
vi.mock("@/utils/subtitles/dubbing/prepare-audio", () => ({
  prepareAudioFile: h.audio,
  recordVideoAudio: h.audio,
}))
vi.mock("../subtitles-ui-context", () => ({ useSubtitlesUI: () => h.ui }))
vi.mock("@/entrypoints/subtitles.content/atoms", async () => {
  const { atom, createStore } = await import("jotai")
  return {
    subtitlesStore: createStore(),
    currentVideoIdAtom: atom("video1"),
    adPlayingAtom: atom(false),
  }
})
const cues = [{ text: "Hello.", start: 0, end: 1000 }]
const profile = () =>
  parseSmartProfile(
    {
      audioMatchesTranscript: true,
      summary: "Chào hỏi",
      context: "Chào hỏi",
      speakers: [
        {
          id: "s1",
          voice: "marin",
          presentation: "unclear",
          description: "calm",
          speed: 1,
          instructions: "calm",
        },
      ],
      assignments: [{ from: 0, to: 0, speaker: "s1", confidence: 1 }],
    },
    cues,
  )
let ui: NonNullable<ReturnType<typeof useSmartVideo>>
function Read() {
  const value = useSmartVideo()!
  useLayoutEffect(() => {
    ui = value
  }, [value])
  return <span>{value.status}</span>
}
function setup() {
  const view = render(
    <Provider store={subtitlesStore}>
      <SmartVideoProvider>
        <Read />
      </SmartVideoProvider>
    </Provider>,
  )
  act(() => ui.setMode("prepared"))
  return view
}
beforeEach(() => {
  vi.stubGlobal("TextEncoder", TextEncoder)
  vi.stubGlobal("TextDecoder", TextDecoder)
  vi.clearAllMocks()
  subtitlesStore.set(configAtom, structuredClone(DEFAULT_CONFIG))
  const video = document.createElement("video")
  Object.defineProperty(video, "duration", { value: 1, configurable: true })
  document.body.append(video)
  let applied: any = null
  h.ui = {
    getDubbingVideoElement: () => video,
    getSentenceStudySource: async () => cues,
    getSmartProfile: () => applied,
    setSmartProfile: vi.fn<(...args: any[]) => any>((p) => {
      applied = p
    }),
  }
  h.send.mockResolvedValue({ configured: true, revision: 1 })
  h.stream.mockResolvedValue(profile())
  h.audio.mockResolvedValue({ audio: "UklGRjAwMDBXQVZFMDAwMA==", format: "wav", duration: 1 })
})
afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})
it("is off and free on mount/options, then reuses one explicit prepared result in RAM", async () => {
  setup()
  expect(ui.enabled).toBe(false)
  expect(h.stream).not.toHaveBeenCalled()
  expect(h.send).not.toHaveBeenCalled()
  act(() => ui.setEnabled(true))
  expect(h.stream).not.toHaveBeenCalled()
  await act(async () => {
    expect(await ui.prepare()).toBe(true)
  })
  expect(h.audio).toHaveBeenCalledOnce()
  expect(h.stream).toHaveBeenCalledOnce()
  expect(ui.profile?.speakers).toHaveLength(1)
  await act(async () => {
    expect(await ui.prepare()).toBe(true)
  })
  expect(h.stream).toHaveBeenCalledOnce()
  act(() => ui.setEnabled(false))
  expect(ui.profile).toBeNull()
  expect(h.ui.getSmartProfile()).toBeNull()
})
it("does not upload after cancellation, config changes, missing CC or changed credentials during preparation", async () => {
  let release!: (value: any) => void
  h.audio.mockImplementation(
    () =>
      new Promise((r) => {
        release = r
      }),
  )
  setup()
  act(() => ui.setEnabled(true))
  let result!: Promise<boolean>
  act(() => {
    result = ui.prepare()
  })
  await waitFor(() => expect(h.audio).toHaveBeenCalledOnce())
  act(() => ui.cancel())
  release({ audio: "A".repeat(16), format: "wav", duration: 1 })
  await act(async () => {
    expect(await result).toBe(false)
  })
  expect(h.stream).not.toHaveBeenCalled()
  expect(ui.profile).toBeNull()
  h.ui.getSentenceStudySource = async () => []
  await act(async () => {
    expect(await ui.prepare()).toBe(false)
  })
  expect(h.stream).not.toHaveBeenCalled()
  h.ui.getSentenceStudySource = async () => cues
  h.audio.mockResolvedValue({ audio: "A".repeat(16), format: "wav", duration: 1 })
  h.send
    .mockResolvedValueOnce({ configured: true, revision: 1 })
    .mockResolvedValue({ configured: true, revision: 2 })
  await act(async () => {
    expect(await ui.prepare()).toBe(false)
  })
  expect(h.stream).not.toHaveBeenCalled()
})
it("rejects late analysis and clears context without starting another translation on config changes", async () => {
  let release!: (value: any) => void
  h.stream.mockImplementation(
    () =>
      new Promise((r) => {
        release = r
      }),
  )
  setup()
  act(() => ui.setEnabled(true))
  let result!: Promise<boolean>
  act(() => {
    result = ui.prepare()
  })
  await waitFor(() => expect(h.stream).toHaveBeenCalledOnce())
  act(() =>
    subtitlesStore.set(configAtom, {
      ...DEFAULT_CONFIG,
      language: { ...DEFAULT_CONFIG.language, targetCode: "ja" },
    }),
  )
  release(profile())
  await act(async () => {
    expect(await result).toBe(false)
  })
  expect(ui.profile).toBeNull()
  expect(ui.enabled).toBe(false)
  expect(h.ui.setSmartProfile).toHaveBeenCalledWith(null, false)
  expect(h.stream).toHaveBeenCalledOnce()
})

it("rejects videos beyond ten minutes before native CC loading, capture or API work", async () => {
  setup()
  Object.defineProperty(h.ui.getDubbingVideoElement(), "duration", { value: 601 })
  act(() => ui.setEnabled(true))
  await act(async () => {
    expect(await ui.prepare()).toBe(false)
  })
  expect(h.send).not.toHaveBeenCalled()
  expect(h.audio).not.toHaveBeenCalled()
  expect(h.stream).not.toHaveBeenCalled()
  expect(ui.status).toContain("10 phút")
})

it("does not silently reuse a previous profile after the user selects a different audio file", async () => {
  setup()
  act(() => ui.setEnabled(true))
  await act(async () => {
    expect(await ui.prepare()).toBe(true)
  })
  expect(h.stream).toHaveBeenCalledOnce()
  act(() => ui.chooseFile(new File(["audio"], "different.mp3")))
  expect(h.stream).toHaveBeenCalledOnce()
  await act(async () => {
    expect(await ui.prepare()).toBe(true)
  })
  expect(h.stream).toHaveBeenCalledTimes(2)
})
