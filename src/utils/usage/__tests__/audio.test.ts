import { describe, expect, it } from "vitest"
import { wavFixture } from "@/utils/vocabulary/__tests__/fixtures"
import { wavDurationMs, realtimeUsageFields } from "../audio"
describe("audio usage measurements", () => {
  it("measures only PCM data, not metadata chunks", () => {
    const source = wavFixture(),
      next = new Uint8Array(source.length + 20)
    next.set(source.subarray(0, 36))
    next.set([74, 85, 78, 75, 12, 0, 0, 0], 36)
    next.set(source.subarray(36), 56)
    new DataView(next.buffer).setUint32(4, next.length - 8, true)
    expect(wavDurationMs(source)).toBe(50)
    expect(wavDurationMs(next)).toBe(50)
  })
  it("keeps invalid or truncated WAV duration unknown", () => {
    expect(wavDurationMs(new Uint8Array(44))).toBeNull()
    expect(wavDurationMs(wavFixture().subarray(0, 80))).toBeNull()
  })
  it("uses reported realtime tokens and never invents missing usage", () => {
    expect(
      realtimeUsageFields({
        input_tokens: 12,
        output_tokens: 54,
        input_token_details: { cached_tokens: 3 },
      }),
    ).toEqual({ input: 12, output: 54, cachedInput: 3 })
    expect(realtimeUsageFields(undefined)).toEqual({})
  })
})
