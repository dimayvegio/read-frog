import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { monitorRecordingSilence, SpeechEndDetector } from "../silence"
beforeEach(() => {
  level = 0
  contexts = []
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it("waits through initial silence and a short impulse before ending a spoken word after 1.5 seconds quiet", () => {
  const detector = new SpeechEndDetector()
  expect(detector.push(0, 0)).toBe(false)
  expect(detector.push(0, 5000)).toBe(false)
  expect(detector.push(0.05, 5040)).toBe(false)
  expect(detector.push(0, 5080)).toBe(false)
  expect(detector.push(0, 9000)).toBe(false)
  for (const at of [9040, 9080, 9120]) expect(detector.push(0.02, at)).toBe(false)
  expect(detector.push(0, 9160)).toBe(false)
  expect(detector.push(0, 10659)).toBe(false)
  expect(detector.push(0, 10660)).toBe(true)
})
it("keeps a pause within a sentence and resets quiet time when speech resumes", () => {
  const detector = new SpeechEndDetector()
  for (const at of [0, 40, 80]) detector.push(0.02, at)
  expect(detector.push(0, 100)).toBe(false)
  expect(detector.push(0, 1400)).toBe(false)
  expect(detector.push(0.02, 1450)).toBe(false)
  expect(detector.push(0, 1500)).toBe(false)
  expect(detector.push(0, 2999)).toBe(false)
  expect(detector.push(0, 3000)).toBe(true)
})
it("ignores invalid/backward samples and does not mistake persistent audible background for silence", () => {
  const detector = new SpeechEndDetector()
  for (const at of [0, 40, 80]) detector.push(0.02, at)
  expect(detector.push(NaN, 100)).toBe(false)
  expect(detector.push(-1, 100)).toBe(false)
  expect(detector.push(0, 50)).toBe(false)
  expect(detector.push(0, 100)).toBe(false)
  expect(detector.push(0.005, 1200)).toBe(false)
  expect(detector.push(0, 1400)).toBe(false)
  expect(detector.push(0, 2899)).toBe(false)
  expect(detector.push(0, 2900)).toBe(true)
})

let level = 0,
  contexts: FakeContext[] = []
class FakeContext {
  state = "running"
  source = { connect: vi.fn<(...args: any[]) => any>(), disconnect: vi.fn<() => void>() }
  analyser = {
    fftSize: 1024,
    getFloatTimeDomainData: (samples: Float32Array) => samples.fill(level),
    disconnect: vi.fn<() => void>(),
  }
  resume = vi.fn<() => Promise<void>>().mockResolvedValue()
  close = vi.fn<() => Promise<void>>().mockImplementation(async () => {
    this.state = "closed"
  })
  createMediaStreamSource = vi.fn<(...args: any[]) => any>().mockImplementation(() => this.source)
  createAnalyser = () => this.analyser
  constructor() {
    contexts.push(this)
  }
}
it("uses one local graph, stops once after speech, closes all analysis resources and never routes mic to speakers", async () => {
  vi.useFakeTimers()
  vi.stubGlobal("AudioContext", FakeContext)
  vi.spyOn(performance, "now").mockImplementation(() => Date.now())
  const stop = vi.fn<() => void>(),
    unavailable = vi.fn<() => void>()
  const dispose = monitorRecordingSilence({} as MediaStream, stop, unavailable)
  await vi.advanceTimersByTimeAsync(2000)
  expect(stop).not.toHaveBeenCalled()
  level = 0.02
  await vi.advanceTimersByTimeAsync(240)
  level = 0
  await vi.advanceTimersByTimeAsync(1440)
  expect(stop).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(200)
  expect(stop).toHaveBeenCalledTimes(1)
  expect(contexts[0]!.source.connect).toHaveBeenCalledWith(contexts[0]!.analyser)
  expect(contexts[0]!.source.disconnect).toHaveBeenCalledTimes(1)
  expect(contexts[0]!.analyser.disconnect).toHaveBeenCalledTimes(1)
  expect(contexts[0]!.close).toHaveBeenCalledTimes(1)
  expect(unavailable).not.toHaveBeenCalled()
  dispose()
  await vi.advanceTimersByTimeAsync(3000)
  expect(stop).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})
it("manual cancellation during pending audio resume prevents later polling or stop callbacks", async () => {
  vi.useFakeTimers()
  let resume!: () => void
  class PendingContext extends FakeContext {
    override resume = vi.fn<() => Promise<void>>().mockImplementation(
      () =>
        new Promise((resolve) => {
          resume = resolve
        }),
    )
  }
  vi.stubGlobal("AudioContext", PendingContext)
  const stop = vi.fn<() => void>(),
    unavailable = vi.fn<() => void>()
  const dispose = monitorRecordingSilence({} as MediaStream, stop, unavailable)
  dispose()
  resume()
  await vi.advanceTimersByTimeAsync(5000)
  expect(stop).not.toHaveBeenCalled()
  expect(unavailable).not.toHaveBeenCalled()
  expect(contexts[0]!.close).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})
it("falls back to manual recording when analysis is unavailable", async () => {
  class UnavailableContext extends FakeContext {
    override resume = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("Audio blocked"))
  }
  vi.stubGlobal("AudioContext", UnavailableContext)
  const stop = vi.fn<() => void>(),
    unavailable = vi.fn<() => void>()
  const dispose = monitorRecordingSilence({} as MediaStream, stop, unavailable)
  await vi.waitFor(() => expect(unavailable).toHaveBeenCalledTimes(1))
  expect(stop).not.toHaveBeenCalled()
  expect(contexts[0]!.close).toHaveBeenCalledTimes(1)
  dispose()
})
