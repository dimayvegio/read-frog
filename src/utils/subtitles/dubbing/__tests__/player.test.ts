import { describe, expect, it } from "vitest"
import { wavFixture } from "@/utils/vocabulary/__tests__/fixtures"
import { decodeDubbingAudio } from "../player"
describe("bounded private WAV", () => {
  it("accepts valid PCM and measures real duration", () => {
    const a = decodeDubbingAudio({
      contentType: "audio/wav",
      audioBase64: Buffer.from(wavFixture()).toString("base64"),
    })
    expect(a.duration).toBeGreaterThan(0)
    expect(a.bytes.byteLength).toBeGreaterThan(44)
  })
  it("rejects corrupt, oversized or non-WAV responses", () => {
    for (const chunk of [
      { contentType: "audio/mp3", audioBase64: "AAAA" },
      { contentType: "audio/wav", audioBase64: "AAAA" },
      { contentType: "audio/wav", audioBase64: "A".repeat(12 * 1024 * 1024 + 1) },
    ])
      expect(() => decodeDubbingAudio(chunk)).toThrow(
        /Invalid dubbing audio|Dubbing audio duration exceeds limit/,
      )
  })
})
