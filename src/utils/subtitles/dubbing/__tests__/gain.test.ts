import { afterEach, expect, it, vi } from "vitest"
import { wavFixture } from "@/utils/vocabulary/__tests__/fixtures"
import { HtmlVoicePlayer, dubbingPeak } from "../player"
afterEach(() => vi.unstubAllGlobals())
it("adjusts and clamps the existing audio graph, seeks locally, and closes all owned resources", async () => {
  const gain = {
    setValueAtTime: vi.fn<(...args: any[]) => any>(),
    cancelScheduledValues: vi.fn<(...args: any[]) => any>(),
    setTargetAtTime: vi.fn<(...args: any[]) => any>(),
  }
  const disconnect = vi.fn<(...args: any[]) => any>(),
    close = vi.fn<(...args: any[]) => any>(async () => {}),
    play = vi.fn<(...args: any[]) => any>(async () => {})
  const audio = {
    play,
    pause: vi.fn<(...args: any[]) => any>(),
    removeAttribute: vi.fn<(...args: any[]) => any>(),
    load: vi.fn<(...args: any[]) => any>(),
    currentTime: 0,
    src: "",
  }
  const createSource = vi.fn<(...args: any[]) => any>(() => ({
    connect: vi.fn<(...args: any[]) => any>(),
    disconnect,
  }))
  vi.stubGlobal("Audio", function AudioMock() {
    return audio
  })
  vi.stubGlobal(
    "AudioContext",
    class {
      currentTime = 0
      destination = {}
      createMediaElementSource = createSource
      createGain = () => ({ gain, connect: vi.fn<(...args: any[]) => any>(), disconnect })
      resume = async () => {}
      close = close
    },
  )
  const create = vi.fn<(...args: any[]) => any>(() => "blob:owned"),
    revoke = vi.fn<(...args: any[]) => any>()
  vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke })
  const p = new HtmlVoicePlayer()
  p.setVolume(1.5)
  expect(createSource).not.toHaveBeenCalled()
  await p.unlock()
  await p.play({ bytes: new Uint8Array(46), duration: 2, peak: 0.5 }, 0, 1, () => {})
  expect(gain.setValueAtTime).toHaveBeenLastCalledWith(1.5, 0)
  const calls = play.mock.calls.length
  p.setVolume(0.2)
  p.seek(1.2)
  expect(audio.currentTime).toBe(1.2)
  expect(gain.setTargetAtTime).toHaveBeenLastCalledWith(0.2, 0, 0.015)
  expect(play).toHaveBeenCalledTimes(calls)
  await p.play({ bytes: new Uint8Array(46), duration: 2, peak: 1 }, 0, 1, () => {})
  p.setVolume(1.5)
  expect(gain.setTargetAtTime).toHaveBeenLastCalledWith(0.98, 0, 0.015)
  p.seek(99)
  expect(audio.currentTime).toBe(1.99)
  p.destroy()
  expect(close).toHaveBeenCalledOnce()
  expect(disconnect).toHaveBeenCalledTimes(2)
  expect(revoke).toHaveBeenCalledTimes(create.mock.calls.length)
})
it("measures bounded PCM peaks and never boosts unknown encodings", () => {
  const wav = wavFixture(),
    v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  for (let i = 44; i + 2 <= wav.length; i += 2) v.setInt16(i, 16384, true)
  expect(dubbingPeak(wav)).toBe(0.5)
  v.setUint16(20, 3, true)
  expect(dubbingPeak(wav)).toBe(1)
  expect(dubbingPeak(new Uint8Array(20))).toBe(1)
})
