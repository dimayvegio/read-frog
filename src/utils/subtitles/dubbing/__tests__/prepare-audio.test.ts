import { afterEach, expect, it, vi } from "vitest"
import { recordVideoAudio } from "../prepare-audio"
vi.mock("@breezystack/lamejs", () => ({
  Mp3Encoder: class {
    encodeBuffer() {
      return new Uint8Array([255, 251, 0])
    }
    flush() {
      return new Uint8Array([0, 0])
    }
  },
}))
afterEach(() => vi.unstubAllGlobals())
function setup() {
  let process: any
  const stop = vi.fn<() => void>(),
    close = vi.fn<() => Promise<void>>(async () => {}),
    disconnect = vi.fn<() => void>()
  const processor = { disconnect, connect: () => {}, onaudioprocess: null as any }
  const tracks = {
    getTracks: () => [{ stop }],
    getVideoTracks: () => [],
    getAudioTracks: () => [{ stop }],
  }
  vi.stubGlobal(
    "MediaStream",
    class {
      getAudioTracks = () => tracks.getAudioTracks()
    },
  )
  vi.stubGlobal(
    "AudioContext",
    class {
      destination = {}
      resume = async () => {}
      close = close
      createMediaStreamSource = () => ({ connect: () => {}, disconnect })
      createScriptProcessor = () => {
        process = processor
        return processor
      }
      createGain = () => ({ gain: { value: 1 }, connect: () => {}, disconnect })
    },
  )
  class Video extends EventTarget {
    duration = 4
    playbackRate = 1.25
    paused = true
    ended = false
    isConnected = true
    currentSrc = "blob:video"
    private time = 2
    get currentTime() {
      return this.time
    }
    set currentTime(n: number) {
      this.time = n
      queueMicrotask(() => this.dispatchEvent(new Event("seeked")))
    }
    captureStream = () => tracks
    pause = () => {
      this.paused = true
    }
    play = async () => {
      this.paused = false
    }
  }
  const video = new Video()
  const pulse = () =>
    processor.onaudioprocess?.({
      inputBuffer: {
        numberOfChannels: 1,
        length: 32,
        getChannelData: () => new Float32Array(32).fill(0.2),
      },
    })
  return {
    video,
    stop,
    close,
    disconnect,
    pulse,
    ready: () => vi.waitFor(() => expect(process?.onaudioprocess).toBeTypeOf("function")),
  }
}
it("pre-records only the selected video, encodes bounded MP3 and restores position/rate paused", async () => {
  const s = setup(),
    c = new AbortController()
  const task = recordVideoAudio(
    s.video as unknown as HTMLVideoElement,
    c.signal,
    () => true,
    () => {},
  )
  await s.ready()
  s.pulse()
  s.video.ended = true
  s.video.dispatchEvent(new Event("ended"))
  const result = await task
  expect(result.format).toBe("mp3")
  expect(result.duration).toBe(4)
  expect(s.video.currentTime).toBe(2)
  expect(s.video.playbackRate).toBe(1.25)
  expect(s.video.paused).toBe(true)
  expect(s.stop).toHaveBeenCalledOnce()
  expect(s.close).toHaveBeenCalledOnce()
  expect(s.disconnect).toHaveBeenCalledTimes(3)
})
it("cancellation restores the owned original position even though the analysis owner is now invalid", async () => {
  const s = setup(),
    c = new AbortController()
  const task = recordVideoAudio(
    s.video as unknown as HTMLVideoElement,
    c.signal,
    () => !c.signal.aborted,
    () => {},
    () => true,
  )
  const rejected = task.catch((e: unknown) => e)
  await s.ready()
  c.abort()
  expect(await rejected).toMatchObject({ message: expect.stringMatching(/Đã hủy/) })
  expect(s.video.currentTime).toBe(2)
  expect(s.video.paused).toBe(true)
  expect(s.close).toHaveBeenCalledOnce()
})
it("does not seek a changed source or override a user's seek", async () => {
  const s = setup(),
    c = new AbortController()
  const task = recordVideoAudio(
    s.video as unknown as HTMLVideoElement,
    c.signal,
    () => true,
    () => {},
    () => false,
  )
  const rejected = task.catch((e: unknown) => e)
  await s.ready()
  s.video.currentTime = 3
  s.video.dispatchEvent(new Event("seeking"))
  expect(await rejected).toMatchObject({ message: expect.stringMatching(/bạn tua/) })
  expect(s.video.currentTime).toBe(3)
  expect(s.close).toHaveBeenCalledOnce()
  expect(s.stop).toHaveBeenCalledOnce()
})
