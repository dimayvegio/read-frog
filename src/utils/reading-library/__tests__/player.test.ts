import type { ReadingStep } from "../audio"
import { beforeEach, afterEach, it, expect, vi } from "vitest"
import { ReadingPlayer } from "../player"
let audios: FakeAudio[] = [],
  created = 0
const revoked: string[] = []
class FakeAudio {
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  pause = vi.fn<() => void>()
  removeAttribute = vi.fn<(...args: any[]) => any>()
  load = vi.fn<() => void>()
  play = vi.fn<() => Promise<void>>().mockResolvedValue()
  constructor() {
    audios.push(this)
  }
}
beforeEach(() => {
  audios = []
  created = 0
  revoked.length = 0
  vi.useFakeTimers()
  vi.stubGlobal("Audio", FakeAudio)
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:audio-${++created}`)
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
    revoked.push(url)
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it("retains a clip when pause interrupts its pending native play promise", async () => {
  let interrupt!: (error: unknown) => void
  const states: string[] = [],
    asset = { id: "sample", type: "audio/mpeg" as const, bytes: new Uint8Array([1]) }
  const player = new ReadingPlayer(
    () => {},
    (state) => states.push(state),
  )
  const pending = player.play([{ pair: 0, side: "original", asset }])
  await vi.advanceTimersByTimeAsync(25)
  // A quick pause/resume/pause interrupts resume's pending native play promise.
  audios[0]!.play.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        interrupt = reject
      }),
  )
  player.pause()
  player.resume()
  player.pause()
  interrupt(new DOMException("play interrupted by pause", "AbortError"))
  await Promise.resolve()
  expect(states.at(-1)).toBe("paused")
  player.resume()
  audios[0]!.onended?.()
  await pending
  expect(states.at(-1)).toBe("idle")
  expect(audios).toHaveLength(1)
})
it("pauses the remaining gap, resumes in order and revokes every audio URL on stop", async () => {
  const transitions: string[] = [],
    states: string[] = [],
    asset = { id: "sample", type: "audio/mpeg" as const, bytes: new Uint8Array([1]) }
  const steps: ReadingStep[] = [
    { pair: 0, side: "original", asset },
    { pair: 0, side: "gap", seconds: 3 },
    { pair: 0, side: "translation", asset },
  ]
  const player = new ReadingPlayer(
      (step) => {
        if (step) transitions.push(step.side)
      },
      (state) => states.push(state),
    ),
    pending = player.play(steps)
  await vi.advanceTimersByTimeAsync(25)
  expect(audios).toHaveLength(1)
  audios[0]!.onended?.()
  await vi.advanceTimersByTimeAsync(1000)
  player.pause()
  await vi.advanceTimersByTimeAsync(10000)
  expect(audios).toHaveLength(1)
  player.resume()
  await vi.advanceTimersByTimeAsync(2025)
  expect(audios).toHaveLength(2)
  player.stop()
  await pending
  expect(transitions).toEqual(["original", "gap", "translation"])
  expect(states).toContain("paused")
  expect(revoked).toHaveLength(2)
})
