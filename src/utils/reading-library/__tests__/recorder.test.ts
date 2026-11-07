import { afterEach, beforeEach, it, expect, vi } from "vitest"
import { ShadowRecorder } from "../recorder"
const { monitor } = vi.hoisted(() => ({ monitor: vi.fn<(...args: any[]) => any>() }))
vi.mock("../silence", () => ({ monitorRecordingSilence: monitor }))

let recorders: FakeRecorder[] = []
class FakeRecorder {
  static isTypeSupported(type: string) {
    return type.startsWith("audio/webm")
  }
  state = "inactive"
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() {
    recorders.push(this)
  }
  start() {
    this.state = "recording"
  }
  stop() {
    this.state = "inactive"
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x80])]) })
      this.onstop?.()
    })
  }
}
beforeEach(() => {
  recorders = []
  monitor.mockReset()
  vi.stubGlobal("MediaRecorder", FakeRecorder)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it("requests only audio on explicit start, stops every track and returns local audio", async () => {
  const stop = vi.fn<() => void>(),
    media = vi.fn<(...args: any[]) => any>().mockResolvedValue({ getTracks: () => [{ stop }] }),
    states: string[] = []
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: media } })
  const recorder = new ShadowRecorder((state) => states.push(state))
  expect(media).not.toHaveBeenCalled()
  const pending = recorder.start()
  await vi.waitFor(() => expect(recorders).toHaveLength(1))
  recorder.stop()
  const result = await pending
  expect(result?.type).toBe("audio/webm")
  expect(media).toHaveBeenCalledWith({ audio: true, video: false })
  expect(stop).toHaveBeenCalled()
  expect(states.at(-1)).toBe("idle")
})
it("releases a microphone granted after cancellation and keeps no recording", async () => {
  let allow!: (value: unknown) => void
  const stop = vi.fn<() => void>()
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: () =>
        new Promise((resolve) => {
          allow = resolve
        }),
    },
  })
  const recorder = new ShadowRecorder(() => {}),
    pending = recorder.start()
  recorder.stop(true)
  allow({ getTracks: () => [{ stop }] })
  expect(await pending).toBeNull()
  expect(stop).toHaveBeenCalledTimes(1)
  expect(recorders).toHaveLength(0)
})
it("automatically stops after sixty seconds and recovers when permission is denied", async () => {
  vi.useFakeTimers()
  const stop = vi.fn<() => void>(),
    media = vi.fn<(...args: any[]) => any>().mockResolvedValue({ getTracks: () => [{ stop }] })
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: media } })
  const recorder = new ShadowRecorder(() => {}),
    pending = recorder.start()
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(60000)
  expect(await pending).not.toBeNull()
  expect(stop).toHaveBeenCalled()
  media.mockRejectedValueOnce(new Error("denied"))
  await expect(recorder.start()).rejects.toThrow(/Cho phép micro/)
})
it("allows pronunciation practice to stop at thirty seconds without changing shadowing's default", async () => {
  vi.useFakeTimers()
  const stop = vi.fn<() => void>()
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop }] }) },
  })
  const recorder = new ShadowRecorder(() => {}, 30000),
    pending = recorder.start()
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(30000)
  expect(await pending).not.toBeNull()
  expect(stop).toHaveBeenCalled()
})
it("uses the existing mic stream for opt-in silence stop and releases analysis and tracks without discarding the take", async () => {
  const stop = vi.fn<() => void>(),
    dispose = vi.fn<() => void>(),
    onAutoStop = vi.fn<() => void>()
  let trigger!: () => void
  monitor.mockImplementation((_stream, onSilence) => {
    trigger = onSilence
    return dispose
  })
  const stream = { getTracks: () => [{ stop }] },
    media = vi.fn<(...args: any[]) => any>().mockResolvedValue(stream)
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: media } })
  const recorder = new ShadowRecorder(() => {}, 30000),
    pending = recorder.start({ stopOnSilence: true, onSilenceStop: onAutoStop })
  await vi.waitFor(() => expect(monitor).toHaveBeenCalledTimes(1))
  expect(monitor.mock.calls[0]![0]).toBe(stream)
  trigger()
  expect(await pending).not.toBeNull()
  expect(media).toHaveBeenCalledTimes(1)
  expect(dispose).toHaveBeenCalledTimes(1)
  expect(stop).toHaveBeenCalled()
  expect(onAutoStop).toHaveBeenCalledTimes(1)
  trigger()
  expect(onAutoStop).toHaveBeenCalledTimes(1)
})
it("retains manual recording and the old shadowing default when silence stop is disabled", async () => {
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn<() => void>() }] }),
    },
  })
  const recorder = new ShadowRecorder(() => {}),
    pending = recorder.start()
  await vi.waitFor(() => expect(recorders).toHaveLength(1))
  expect(monitor).not.toHaveBeenCalled()
  recorder.stop()
  expect(await pending).not.toBeNull()
})
