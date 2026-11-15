import { afterEach, expect, it, vi } from "vitest"
import { validSmartAudio } from "../audio-envelope"
import { MonoPcmConverter } from "../pcm"
import { sameDubbingScope } from "../scope"
afterEach(() => vi.unstubAllGlobals())
it("compares immutable ownership without serializing config or profile, and rejects each changed owner", () => {
  const snapshot = {
    id: "a",
    config: {
      toJSON() {
        throw new Error("Do not serialize")
      },
    },
    context: "topic",
    profile: {
      toJSON() {
        throw new Error("Do not serialize")
      },
    },
  }
  expect(sameDubbingScope(snapshot, { ...snapshot })).toBe(true)
  for (const patch of [{ id: "b" }, { config: {} }, { context: "new" }, { profile: {} }])
    expect(sameDubbingScope(snapshot, { ...snapshot, ...patch })).toBe(false)
})
it("reuses the PCM block, reads each channel once and preserves clipping/mixing and peak", () => {
  const converter = new MonoPcmConverter()
  const left = new Float32Array([1, -1, 0.5, 0, NaN]),
    right = new Float32Array([0, -1, -0.5, 2, 1])
  const get = vi.fn<(n: number) => Float32Array>((n) => (n === 0 ? left : right))
  const input = { length: 5, numberOfChannels: 2, getChannelData: get }
  const pcm = converter.convert(input)
  expect([...pcm]).toEqual([16384, -32767, 0, 32767, 0])
  expect(converter.peak).toBe(1)
  expect(get).toHaveBeenCalledTimes(2)
  expect(converter.convert(input)).toBe(pcm)
  expect(get).toHaveBeenCalledTimes(4)
  expect(() => converter.convert({ ...input, numberOfChannels: 33 })).toThrow(/Invalid audio block/)
})
it("validates padding/size/magic without decoding a complete large audio payload", () => {
  const wav = Buffer.from("RIFF0000WAVE" + "a".repeat(1024 * 1024)).toString("base64")
  const decode = vi.fn<(s: string) => string>((value) =>
    Buffer.from(value, "base64").toString("latin1"),
  )
  vi.stubGlobal("atob", decode)
  expect(validSmartAudio(wav, "wav", 8 * 1024 * 1024)).toBe(true)
  expect(decode).toHaveBeenCalledWith(wav.slice(0, 16))
  expect(decode.mock.calls.every(([value]) => value.length === 16)).toBe(true)
  for (const value of [
    wav.slice(1),
    "=" + wav.slice(1),
    wav.slice(0, 24) + "!" + wav.slice(25),
    wav + "AAAA",
  ]) {
    expect(validSmartAudio(value, "wav", 1024 * 1024)).toBe(false)
  }
  expect(validSmartAudio(wav, "wav", 12)).toBe(false)
  expect(validSmartAudio(Buffer.from("ID3" + "a".repeat(20)).toString("base64"), "mp3", 100)).toBe(
    true,
  )
  expect(validSmartAudio(Buffer.from("invalid-header").toString("base64"), "wav", 100)).toBe(false)
})
