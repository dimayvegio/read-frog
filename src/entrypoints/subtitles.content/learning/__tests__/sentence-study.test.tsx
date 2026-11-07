// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  adPlayingAtom,
  currentVideoIdAtom,
  sourceTrackAtom,
  studySourceTrackAtom,
  subtitlesVisibleAtom,
} from "../../atoms"
import { SentenceStudyControls, SentenceStudyRuntime } from "../sentence-study"

const mock = vi.hoisted(() => ({
  source: vi.fn<(...args: any[]) => any>(),
  segment: vi.fn<(...args: any[]) => any>(),
  getVideo: vi.fn<(...args: any[]) => any>(),
  play: vi.fn<() => Promise<void>>(),
  getUrl: () => "https://www.youtube.com/watch?v=fixture",
  video: null as HTMLVideoElement | null,
}))
vi.mock("../../ui/subtitles-ui-context", () => ({
  useSubtitlesUI: () => ({
    getVideoPageUrl: mock.getUrl,
    getVideoElement: mock.getVideo,
    getSentenceStudySource: mock.source,
  }),
}))
vi.mock("@/utils/subtitles/study-segmentation-client", () => ({
  requestStudySegmentation: mock.segment,
}))
const source = [
  { text: "Yes.", start: 0, end: 1000 },
  { text: "I agree.", start: 1000, end: 2000 },
]
beforeEach(() => {
  vi.resetAllMocks()
  mock.source.mockResolvedValue(source)
  mock.segment.mockResolvedValue([0, 2])
  mock.video = document.createElement("video")
  mock.getVideo.mockImplementation(() => mock.video)
  mock.play.mockResolvedValue()
  vi.spyOn(mock.video, "play").mockImplementation(mock.play)
  vi.spyOn(mock.video, "pause").mockImplementation(() => {})
})
afterEach(cleanup)
function fixture() {
  const store = createStore()
  store.set(currentVideoIdAtom, "fixture")
  store.set(subtitlesVisibleAtom, true)
  store.set(sourceTrackAtom, [{ text: "Yes. I agree.", start: 0, end: 2000 }])
  render(
    <Provider store={store}>
      <SentenceStudyRuntime />
      <SentenceStudyControls />
    </Provider>,
  )
  return store
}
describe("explicit YouTube AI listening mode", () => {
  it("does nothing while off, prepares only on opt-in, leaves the display track and playback unchanged", async () => {
    const store = fixture()
    expect(mock.source).not.toHaveBeenCalled()
    expect(mock.segment).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText("Luyện nghe từng câu"))
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Đã chuẩn bị 2 câu"),
    )
    expect(store.get(sourceTrackAtom)).toEqual([{ text: "Yes. I agree.", start: 0, end: 2000 }])
    expect(mock.play).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText("Câu sau · L"))
    expect(mock.video!.currentTime).toBe(1)
    expect(screen.getByText("I agree.")).toBeTruthy()
    fireEvent.click(screen.getByLabelText("Luyện nghe từng câu"))
    expect(screen.queryByRole("status")).toBeNull()
    expect(mock.segment).toHaveBeenCalledTimes(1)
  })
  it("cancels pending AI work and resets on navigation; late answers cannot return", async () => {
    let resolve!: (value: number[]) => void
    mock.segment.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const store = fixture()
    fireEvent.click(screen.getByLabelText("Luyện nghe từng câu"))
    await waitFor(() => expect(mock.segment).toHaveBeenCalledTimes(1))
    act(() => store.set(currentVideoIdAtom, "next-video"))
    expect(mock.segment.mock.calls[0]![1].aborted).toBe(true)
    await act(async () => resolve([0, 2]))
    expect(screen.getByLabelText("Luyện nghe từng câu")).not.toBeChecked()
    expect(screen.queryByText("I agree.")).toBeNull()
  })
  it("suspends preparation during an ad and displays a retry instead of a fake AI fallback", async () => {
    mock.segment.mockRejectedValue(new Error("network"))
    const store = fixture()
    act(() => store.set(adPlayingAtom, true))
    fireEvent.click(screen.getByLabelText("Luyện nghe từng câu"))
    expect(mock.source).not.toHaveBeenCalled()
    act(() => store.set(adPlayingAtom, false))
    await screen.findByText("Thử chia câu lại")
    expect(screen.getByRole("button", { name: "Nghe lại · K" })).toBeDisabled()
    mock.segment.mockResolvedValue([0, 2])
    fireEvent.click(screen.getByText("Thử chia câu lại"))
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Đã chuẩn bị 2 câu"),
    )
  })
  it("rebuilds the separate learning track when native CC changes within the same video", async () => {
    const store = fixture()
    fireEvent.click(screen.getByLabelText("Luyện nghe từng câu"))
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Đã chuẩn bị 2 câu"),
    )
    act(() => store.set(studySourceTrackAtom, [{ text: "No. Not now.", start: 0, end: 2000 }]))
    await waitFor(() => expect(mock.segment).toHaveBeenCalledTimes(2))
    await screen.findByText("No.")
    fireEvent.click(screen.getByText("Câu sau · L"))
    expect(screen.getByText("Not now.")).toBeTruthy()
    expect(screen.queryByText("I agree.")).toBeNull()
  })
})
