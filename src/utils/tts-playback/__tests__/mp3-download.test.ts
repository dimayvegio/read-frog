import { describe, it, expect } from "vitest"
import { wavFixture } from "@/utils/vocabulary/__tests__/fixtures"
import { isMp3 } from "@/utils/vocabulary/audio"
import { encodeSpeechMp3 } from "../mp3-download"

describe("whole-passage MP3", () => {
  it("encodes all WAV chunks through one continuous encoder", async () => {
    const one = wavFixture(),
      two = wavFixture()
    // Different final samples expose dropped or reordered chunks.
    two.fill(0, 44)
    const combined = new Uint8Array(one.length + two.length - 44)
    combined.set(one)
    combined.set(two.subarray(44), one.length)
    const view = new DataView(combined.buffer)
    view.setUint32(4, combined.length - 8, true)
    view.setUint32(40, combined.length - 44, true)
    const signal = new AbortController().signal
    const actual = await encodeSpeechMp3([one, two], signal)
    expect(isMp3(actual)).toBe(true)
    expect(actual).toEqual(await encodeSpeechMp3([combined], signal))
    expect(actual.length).toBeGreaterThan((await encodeSpeechMp3([one], signal)).length)
  })
  it("rejects malformed/mixed WAV and observes cancellation during encoding", async () => {
    const signal = new AbortController().signal
    await expect(encodeSpeechMp3([], signal)).rejects.toThrow(/large/)
    await expect(encodeSpeechMp3([new Uint8Array(50)], signal)).rejects.toThrow(/formats/)
    const changed = wavFixture(),
      view = new DataView(changed.buffer)
    view.setUint32(24, 16000, true)
    view.setUint32(28, 32000, true)
    await expect(encodeSpeechMp3([wavFixture(), changed], signal)).rejects.toThrow(/formats/)
    const controller = new AbortController()
    const result = encodeSpeechMp3(
      Array.from({ length: 12 }, () => wavFixture()),
      controller.signal,
    )
    controller.abort()
    await expect(result).rejects.toThrow(/abort/i)
  })
})
