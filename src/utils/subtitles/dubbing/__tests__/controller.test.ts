import type { DubbingAudio, VoicePlayer } from "../player"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DubbingController } from "../controller"
import { VolumeDucker } from "../ducking"
class Video extends EventTarget {
  currentTime = 0
  playbackRate = 1
  paused = false
  seeking = false
  muted = false
  volume = 0.8
  pause = vi.fn<() => void>(() => {
    this.paused = true
    this.dispatchEvent(new Event("pause"))
  })
  play = vi.fn<() => Promise<void>>(async () => {
    this.paused = false
    this.dispatchEvent(new Event("play"))
  })
}
const audio: DubbingAudio = { bytes: new Uint8Array(100), duration: 2 }
const cues = Array.from({ length: 20 }, (_, i) => ({
  id: String(i),
  text: `Sentence ${i}.`,
  start: i * 3000,
  end: i * 3000 + 2500,
}))
const pending = () => {
  let resolve!: (a: DubbingAudio) => void
  let reject!: (e: Error) => void
  const promise = new Promise<DubbingAudio>((r, j) => {
    resolve = r
    reject = j
  })
  return { resolve, reject, promise }
}
function setup(
  generator?: (text: string, signal: AbortSignal) => Promise<DubbingAudio>,
  paused = false,
  duck = 0.2,
) {
  const video = new Video()
  video.paused = paused
  let ended: (error?: boolean) => void = () => {}
  const player: VoicePlayer = {
    unlock: vi.fn<VoicePlayer["unlock"]>(async () => {}),
    play: vi.fn<VoicePlayer["play"]>(async (_a, _o, _r, done) => {
      ended = done
    }),
    pause: vi.fn<VoicePlayer["pause"]>(),
    resume: vi.fn<VoicePlayer["resume"]>(async () => {}),
    position: () => 0,
    setRate: vi.fn<VoicePlayer["setRate"]>(),
    stop: vi.fn<VoicePlayer["stop"]>(),
    destroy: vi.fn<VoicePlayer["destroy"]>(),
  }
  let valid = true
  const generate = vi.fn<NonNullable<typeof generator>>(generator ?? (async () => audio)),
    state = vi.fn<(s: { active: boolean; message: string }) => void>()
  const controller = new DubbingController({
    video: video as unknown as HTMLVideoElement,
    player,
    cues: () => cues,
    valid: () => valid,
    generate,
    state,
    duck,
  })
  return {
    video,
    player,
    generate,
    state,
    controller,
    end: (error?: boolean) => ended(error),
    invalidate: () => {
      valid = false
    },
  }
}
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve()
}
const ready = async () => {
  await flush()
  await vi.advanceTimersByTimeAsync(120)
  await flush()
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})
describe("source-owned video voice", () => {
  it("bounds synthesis to two concurrent jobs and resumes only its own buffer pause", async () => {
    const jobs: ReturnType<typeof pending>[] = []
    const s = setup(() => {
      const j = pending()
      jobs.push(j)
      return j.promise
    })
    expect(s.generate).toHaveBeenCalledTimes(2)
    expect(s.video.paused).toBe(true)
    jobs[0]!.resolve(audio)
    await ready()
    expect(s.player.play).toHaveBeenCalledOnce()
    expect(s.video.play).toHaveBeenCalledOnce()
    s.controller.stop()
  })
  it("never resumes an initially paused video", async () => {
    const s = setup(undefined, true)
    await ready()
    expect(s.video.play).not.toHaveBeenCalled()
    expect(s.player.play).not.toHaveBeenCalled()
    s.controller.stop()
  })
  it("finishes the final utterance without restarting an ended video", async () => {
    const s = setup()
    await ready()
    s.video.paused = true
    s.video.dispatchEvent(new Event("ended"))
    expect(s.player.destroy).not.toHaveBeenCalled()
    s.end()
    expect(s.player.destroy).toHaveBeenCalledOnce()
    expect(s.video.play).toHaveBeenCalledTimes(1)
  })
  it("cancels late generated voice on seek and stops obsolete audio", async () => {
    const jobs: ReturnType<typeof pending>[] = []
    const signals: AbortSignal[] = []
    const s = setup((_t, signal) => {
      signals.push(signal)
      const j = pending()
      jobs.push(j)
      return j.promise
    })
    s.video.currentTime = 40
    s.video.dispatchEvent(new Event("seeking"))
    expect(signals.every((x) => x.aborted)).toBe(true)
    jobs[0]!.resolve(audio)
    await ready()
    expect(s.player.play).not.toHaveBeenCalled()
    s.controller.stop()
  })
  it("synchronizes manual pause, rate and long utterance without overlapping another voice", async () => {
    const s = setup()
    await ready()
    s.video.pause()
    expect(s.player.pause).toHaveBeenCalled()
    await s.video.play()
    s.video.playbackRate = 2
    s.video.dispatchEvent(new Event("ratechange"))
    expect(vi.mocked(s.player.setRate).mock.calls.at(-1)?.[0]).toBeLessThanOrEqual(1.75)
    s.video.currentTime = 2.6
    s.controller.tick()
    expect(s.video.paused).toBe(true)
    expect(s.player.play).toHaveBeenCalledOnce()
    s.end()
    await ready()
    expect(s.video.paused).toBe(false)
    s.controller.stop()
  })
  it("does not fight a user playing through a long-voice hold", async () => {
    const s = setup()
    await ready()
    s.video.currentTime = 2.6
    s.controller.tick()
    await s.video.play()
    expect(s.video.paused).toBe(false)
    expect(s.player.stop).toHaveBeenCalled()
    s.controller.stop()
  })
  it("stops on route/ad/config/key invalidation and restores source volume", async () => {
    const s = setup()
    await ready()
    await vi.advanceTimersByTimeAsync(200)
    expect(s.video.volume).toBeLessThan(0.8)
    s.invalidate()
    s.controller.tick()
    expect(s.player.destroy).toHaveBeenCalledOnce()
    expect(s.video.volume).toBe(0.8)
    expect(s.state.mock.calls.at(-1)?.[0].active).toBe(false)
  })
  it("does not regenerate future audio when the byte budget is full", async () => {
    const large = { bytes: new Uint8Array(8 * 1024 * 1024), duration: 2 }
    const s = setup(async () => large)
    await ready()
    await vi.advanceTimersByTimeAsync(500)
    expect(s.generate).toHaveBeenCalledTimes(2)
    s.video.currentTime = 3
    s.end()
    s.controller.tick()
    await ready()
    expect(s.generate.mock.calls.length).toBeLessThanOrEqual(3)
    s.controller.stop()
  })
  it("does not retry paid failures", async () => {
    const s = setup(async () => {
      throw new Error("provider failed")
    })
    await ready()
    const count = s.generate.mock.calls.length
    await vi.advanceTimersByTimeAsync(10000)
    expect(s.generate).toHaveBeenCalledTimes(count)
    expect(s.state.mock.calls.at(-1)?.[0].active).toBe(false)
  })
  it("explicit Stop releases an owned buffer wait", () => {
    const s = setup(() => new Promise(() => {}))
    s.controller.stop("off", true)
    expect(s.video.play).toHaveBeenCalledOnce()
  })
  it("cleans audio failure and preserves mute with relative volume", async () => {
    const s = setup()
    s.video.muted = true
    await ready()
    await vi.advanceTimersByTimeAsync(200)
    expect(s.video.muted).toBe(true)
    s.end(true)
    expect(s.player.destroy).toHaveBeenCalledOnce()
    expect(s.video.volume).toBe(0.8)
  })
  it("lowers source to five percent before the first voice starts", async () => {
    const s = setup(undefined, false, 0.05)
    await flush()
    await vi.advanceTimersByTimeAsync(99)
    expect(s.player.play).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(s.player.play).toHaveBeenCalledOnce()
    expect(s.video.volume).toBeCloseTo(0.04, 5)
    s.controller.stop()
  })
  it("holds low after short TTS until the source CC ends, then releases smoothly", async () => {
    const s = setup(undefined, false, 0.05)
    await ready()
    s.video.currentTime = 0.5
    s.end()
    await vi.advanceTimersByTimeAsync(1000)
    expect(s.video.volume).toBeCloseTo(0.04, 5)
    s.video.currentTime = 2.5
    s.controller.tick()
    await vi.advanceTimersByTimeAsync(399)
    expect(s.video.volume).toBeCloseTo(0.04, 5)
    await vi.advanceTimersByTimeAsync(201)
    expect(s.video.volume).toBeGreaterThan(0.04)
    expect(s.video.volume).toBeLessThan(0.8)
    await vi.advanceTimersByTimeAsync(500)
    expect(s.video.volume).toBeCloseTo(0.8, 5)
    s.controller.stop()
  })
  it("keeps low when TTS outlasts CC and bridges a nearby next sentence", async () => {
    const s = setup(undefined, false, 0.05)
    await ready()
    s.video.currentTime = 2.6
    s.controller.tick()
    await vi.advanceTimersByTimeAsync(500)
    expect(s.video.volume).toBeCloseTo(0.04, 5)
    s.end()
    s.video.currentTime = 3
    s.controller.tick()
    await vi.advanceTimersByTimeAsync(120)
    expect(s.player.play).toHaveBeenCalledTimes(2)
    expect(s.video.volume).toBeCloseTo(0.04, 5)
    s.controller.stop()
  })
  it("cancels a pending pre-duck start on pause, seek and stop", async () => {
    for (const action of ["pause", "seek", "stop"]) {
      const s = setup()
      await flush()
      await vi.advanceTimersByTimeAsync(50)
      if (action === "pause") s.video.pause()
      else if (action === "seek") {
        s.video.paused = true
        s.video.currentTime = 30
        s.video.dispatchEvent(new Event("seeking"))
      } else s.controller.stop()
      await vi.advanceTimersByTimeAsync(700)
      expect(s.player.play).not.toHaveBeenCalled()
      expect(s.video.volume).toBeCloseTo(0.8, 5)
      s.controller.stop()
    }
  })
  it("does not start the same cue again while native audio play is pending", async () => {
    const s = setup()
    s.player.play = vi.fn<VoicePlayer["play"]>(() => new Promise(() => {}))
    await ready()
    await vi.advanceTimersByTimeAsync(1000)
    expect(s.player.play).toHaveBeenCalledOnce()
    s.controller.stop()
  })
  it("does not re-duck after manual pause while waiting for the original sentence end", async () => {
    const s = setup(undefined, false, 0.05)
    await ready()
    s.end()
    s.video.pause()
    await vi.advanceTimersByTimeAsync(700)
    expect(s.video.volume).toBeCloseTo(0.8, 5)
    expect(s.video.play).toHaveBeenCalledTimes(1)
    s.controller.stop()
  })
  it("respects the user's volume change while ducked", async () => {
    const video = new Video()
    const duck = new VolumeDucker(video as unknown as HTMLVideoElement, 0.2)
    duck.speaking(true)
    await vi.advanceTimersByTimeAsync(600)
    video.volume = 0.1
    video.dispatchEvent(new Event("volumechange"))
    duck.destroy()
    expect(video.volume).toBeCloseTo(0.5, 1)
  })
})
