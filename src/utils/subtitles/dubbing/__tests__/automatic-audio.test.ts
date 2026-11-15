import { afterEach, expect, it, vi } from "vitest"
import { sampleVideoAudio } from "../automatic-audio"
vi.mock("@breezystack/lamejs", () => ({
  Mp3Encoder: class {
    encodeBuffer() {
      return new Uint8Array([255, 251, 0])
    }
    flush() {
      return new Uint8Array([0])
    }
  },
}))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
function setup(resume = async () => {}) {
  const stop = vi.fn<() => void>(),
    close = vi.fn<() => Promise<void>>(async () => {}),
    disconnect = vi.fn<() => void>()
  const processor = { connect() {}, disconnect, onaudioprocess: null as any }
  const stream = {
    getTracks: () => [{ stop }],
    getAudioTracks: () => [{ stop }],
    getVideoTracks: () => [],
  }
  vi.stubGlobal(
    "MediaStream",
    class {
      getTracks = () => []
    },
  )
  vi.stubGlobal(
    "AudioContext",
    class {
      destination = {}
      resume = resume
      close = close
      createMediaStreamSource = () => ({ connect() {}, disconnect })
      createScriptProcessor = () => processor
      createGain = () => ({ gain: { value: 1 }, connect() {}, disconnect })
    },
  )
  class Video extends EventTarget {
    currentTime = 650
    playbackRate = 1.25
    volume = 0.8
    paused = false
    ended = false
    captureStream = vi.fn<() => typeof stream>(() => stream)
    play = vi.fn<() => void>()
    pause = vi.fn<() => void>()
  }
  const video = new Video(),
    controller = new AbortController()
  const task = sampleVideoAudio(
    video as unknown as HTMLVideoElement,
    controller.signal,
    () => true,
    () => {},
  )
  const result = task.catch((e: unknown) => e)
  return {
    video,
    controller,
    task,
    result,
    stop,
    close,
    disconnect,
    ready: () => vi.waitFor(() => expect(processor.onaudioprocess).toBeTypeOf("function")),
    pulse: (length = 16000) =>
      processor.onaudioprocess?.({
        inputBuffer: {
          length,
          numberOfChannels: 1,
          getChannelData: () => new Float32Array(length).fill(0.2),
        },
      }),
  }
}
it("samples only played frames, leaves the player untouched and cleans capture after fifteen seconds", async () => {
  const s = setup()
  await s.ready()
  s.video.paused = true
  s.pulse(16000 * 15)
  s.video.paused = false
  for (let i = 0; i < 15; i++) s.pulse()
  expect(await s.task).toMatchObject({ format: "mp3", duration: 15, start: 650000, rate: 1.25 })
  expect(s.video.currentTime).toBe(650)
  expect(s.video.playbackRate).toBe(1.25)
  expect(s.video.volume).toBe(0.8)
  expect(s.video.pause).not.toHaveBeenCalled()
  expect(s.video.play).not.toHaveBeenCalled()
  expect(s.stop).toHaveBeenCalledOnce()
  expect(s.close).toHaveBeenCalledOnce()
  expect(s.disconnect).toHaveBeenCalledTimes(3)
})
it.each(["seeking", "ratechange"])(
  "discards a discontinuous %s sample without restoring or overwriting user intent",
  async (event) => {
    const s = setup()
    await s.ready()
    s.pulse()
    s.video.currentTime = 680
    s.video.dispatchEvent(new Event(event))
    expect(await s.result).toMatchObject({ name: "AbortError" })
    expect(s.video.currentTime).toBe(680)
    expect(s.stop).toHaveBeenCalledOnce()
    expect(s.close).toHaveBeenCalledOnce()
  },
)
it("aborts an unresolved AudioContext resume without acquiring a stream", async () => {
  const s = setup(() => new Promise<void>(() => {}))
  await Promise.resolve()
  s.controller.abort()
  expect(await s.result).toMatchObject({ name: "AbortError" })
  expect(s.video.captureStream).not.toHaveBeenCalled()
  expect(s.close).toHaveBeenCalledOnce()
})
