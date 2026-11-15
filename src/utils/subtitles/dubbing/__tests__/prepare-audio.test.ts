import { afterEach, expect, it, vi } from "vitest"
import { prepareAudioFile, recordVideoAudio } from "../prepare-audio"
const h = vi.hoisted(() => ({ badFlush: false }))
vi.mock("@breezystack/lamejs", () => ({
  Mp3Encoder: class {
    encodeBuffer() {
      return new Uint8Array([255, 251, 0])
    }
    flush() {
      if (h.badFlush) throw new Error("encoder failure")
      return new Uint8Array([0, 0])
    }
  },
}))
afterEach(() => vi.unstubAllGlobals())
function setup() {
  h.badFlush = false
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
      sampleRate = 16000
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
  const pulse = (length = 32) =>
    processor.onaudioprocess?.({
      inputBuffer: {
        numberOfChannels: 1,
        length,
        getChannelData: () => new Float32Array(length).fill(0.2),
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
it("captures a bounded interval from the current position of a long video, then restores it", async () => {
  const s = setup(),
    c = new AbortController()
  s.video.duration = 3600
  const task = recordVideoAudio(
    s.video as unknown as HTMLVideoElement,
    c.signal,
    () => true,
    () => {},
    () => true,
    { start: 2, seconds: 15 },
  )
  await s.ready()
  expect(s.video.currentTime).toBe(2)
  // A browser may deliver our setup pause event after play() has already resumed.
  s.video.dispatchEvent(new Event("pause"))
  for (let i = 0; i < 15; i++) s.pulse(16000)
  expect(await task).toMatchObject({ format: "mp3", duration: 15 })
  expect(s.video.currentTime).toBe(2)
  expect(s.video.paused).toBe(true)
  expect(s.video.playbackRate).toBe(1.25)
  expect(s.stop).toHaveBeenCalledOnce()
  expect(s.close).toHaveBeenCalledOnce()
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

it("pauses a normally playing video before asynchronous encoder/context setup", async () => {
  const s = setup(),
    c = new AbortController()
  s.video.paused = false
  const task = recordVideoAudio(
    s.video as unknown as HTMLVideoElement,
    c.signal,
    () => true,
    () => {},
  )
  expect(s.video.paused).toBe(true)
  await s.ready()
  s.pulse()
  s.video.ended = true
  s.video.dispatchEvent(new Event("ended"))
  await task
  expect(s.video.currentTime).toBe(2)
})

it("rejects a failed encoder flush and still releases capture and AudioContext", async () => {
  const s = setup(),
    c = new AbortController()
  const task = recordVideoAudio(
    s.video as unknown as HTMLVideoElement,
    c.signal,
    () => true,
    () => {},
  )
  const error = task.catch((e: unknown) => e)
  await s.ready()
  s.pulse()
  h.badFlush = true
  s.video.ended = true
  s.video.dispatchEvent(new Event("ended"))
  expect(await error).toMatchObject({ message: expect.stringMatching(/Không hoàn tất/) })
  expect(s.close).toHaveBeenCalledOnce()
  expect(s.stop).toHaveBeenCalledOnce()
})

it("caps actual captured samples even if a player keeps producing audio past its declared duration", async () => {
  const s = setup(),
    c = new AbortController()
  const task = recordVideoAudio(
    s.video as unknown as HTMLVideoElement,
    c.signal,
    () => true,
    () => {},
  )
  const error = task.catch((e: unknown) => e)
  await s.ready()
  for (let i = 0; i < 590; i++) s.pulse(16384)
  expect(await error).toMatchObject({ message: expect.stringMatching(/vượt giới hạn 10 phút/) })
  expect(s.close).toHaveBeenCalledOnce()
  expect(s.stop).toHaveBeenCalledOnce()
})

it("rejects a file over ten minutes from metadata before reading/encoding its bytes", async () => {
  const revoke = vi.fn<(s: string) => void>()
  vi.stubGlobal("URL", { createObjectURL: () => "blob:test", revokeObjectURL: revoke })
  vi.stubGlobal(
    "Audio",
    class {
      duration = 601
      onloadedmetadata: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_url: string) {
        queueMicrotask(() => this.onloadedmetadata?.())
      }
      pause() {}
      removeAttribute() {}
      load() {}
    },
  )
  const file = new File([new Uint8Array(16)], "same-video.mp3"),
    read = vi.spyOn(file, "arrayBuffer")
  await expect(prepareAudioFile(file, new AbortController().signal)).rejects.toThrow(/10 phút/)
  expect(read).not.toHaveBeenCalled()
  expect(revoke).toHaveBeenCalledWith("blob:test")
})
it("keeps a user's seek made during async setup, including cancellation before setup completes", async () => {
  const s = setup(),
    c = new AbortController()
  const task = recordVideoAudio(
    s.video as unknown as HTMLVideoElement,
    c.signal,
    () => true,
    () => {},
  )
  const error = task.catch((e: unknown) => e)
  s.video.currentTime = 3
  s.video.dispatchEvent(new Event("seeking"))
  c.abort()
  expect(await error).toMatchObject({ name: "AbortError" })
  expect(s.video.currentTime).toBe(3)
  expect(s.close).toHaveBeenCalledOnce()
})
