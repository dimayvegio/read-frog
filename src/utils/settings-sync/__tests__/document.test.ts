import { gzipSync } from "node:zlib"
import { sha256 } from "js-sha256"
import { describe, expect, it } from "vitest"
import { toPortableConfig } from "@/utils/config/portable"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import {
  canonical,
  contentHash,
  dataKey,
  headKey,
  mergeClocks,
  packSettings,
  planSettingsSync,
  readHeader,
  unpackSettings,
  MAX_RAW_BYTES,
  CHUNK_LENGTH,
  type SettingsContent,
  type SettingsSnapshot,
  type SyncClock,
} from "../document"
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222"
const content = (): SettingsContent => ({
  config: toPortableConfig(DEFAULT_CONFIG),
  studyHighlightsEnabled: true,
})
async function snapshot(value: SettingsContent, device = a, clock: SyncClock = { [a]: 1 }, at = 1) {
  const packed = await packSettings(value, device, clock, at)
  return (await unpackSettings(packed.header, packed.values))!
}
describe("Edge settings snapshot v1", () => {
  it("round trips actual portable config through standard gzip chunks under the per-item limit", async () => {
    const value = content(),
      packed = await packSettings(value, a, { [a]: 1 })
    expect(readHeader(packed.header, headKey(a))).toEqual(packed.header)
    expect((await unpackSettings(packed.header, packed.values))!.content).toEqual(value)
    expect(
      Object.entries(packed.values).every(
        ([key, row]) => new TextEncoder().encode(key + JSON.stringify(row)).length < 8192,
      ),
    ).toBe(true)
    expect(packed.header.encodedBytes).toBeLessThan(32000)
  })
  it("waits for missing chunks and rejects altered data and future format headers", async () => {
    const packed = await packSettings(content(), a, { [a]: 1 })
    expect(await unpackSettings(packed.header, {})).toBeNull()
    const first = dataKey(packed.header, 0),
      altered = { ...packed.values, [first]: "A" + packed.values[first]!.slice(1) }
    await expect(unpackSettings(packed.header, altered)).rejects.toThrow("checksum")
    expect(() => readHeader({ ...packed.header, version: 2 }, headKey(a))).toThrow(/Invalid/)
    expect(() => readHeader(packed.header, headKey(b))).toThrow("không hợp lệ")
  })
  it("rejects embedded legacy API keys without exporting private credential data", async () => {
    const unsafe = content()
    Object.assign(unsafe.config.providersConfig[0]!, { apiKey: "private-sync-test-sentinel" })
    await expect(packSettings(unsafe, a, { [a]: 1 })).rejects.toThrow("credential")
    expect(canonical(content())).not.toContain("apiKey")
  })
  it("canonicalizes object keys while preserving array order", () => {
    expect(canonical({ b: 1, a: 2, missing: undefined })).toBe(canonical({ a: 2, b: 1 }))
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]))
  })
  it("requires a first-pairing choice instead of silently replacing another configuration", async () => {
    const local = content(),
      remote = await snapshot({ ...local, studyHighlightsEnabled: false }, b, { [b]: 1 })
    expect(planSettingsSync([], local).action).toBe("push")
    expect(planSettingsSync([remote], local).action).toBe("conflict")
    expect(planSettingsSync([remote], remote.content).action).toBe("agreed")
  })
  it("follows causal remote changes and preserves local edits", async () => {
    const local = content(),
      base = await snapshot(local),
      remote = await snapshot({ ...local, studyHighlightsEnabled: false }, b, { [a]: 1, [b]: 1 })
    expect(planSettingsSync([base, remote], local, contentHash(local), { [a]: 1 }).action).toBe(
      "pull",
    )
    expect(planSettingsSync([base], remote.content, contentHash(local), { [a]: 1 }).action).toBe(
      "push",
    )
  })
  it("keeps concurrent branches regardless of clocks and makes an explicit resolution dominate both", async () => {
    const local = content(),
      changed = content()
    changed.config.uiLanguage = "vi"
    const first = await snapshot({ ...local, studyHighlightsEnabled: false }, a, { [a]: 2 }, 99999),
      second = await snapshot(changed, b, { [a]: 1, [b]: 1 }, 1)
    expect(
      planSettingsSync([first, second], first.content, contentHash(local), { [a]: 1 }).action,
    ).toBe("conflict")
    const clock = mergeClocks(first.header.clock, second.header.clock)
    clock[a] = (clock[a] ?? 0) + 1
    const resolved = await snapshot(first.content, a, clock, 2)
    const plan = planSettingsSync([first, second, resolved], first.content)
    expect(plan.action).toBe("agreed")
    expect(plan.heads).toHaveLength(1)
  })
  it("does not confuse equal vector clocks carrying different contents", async () => {
    const value = content(),
      first = await snapshot(value),
      second: SettingsSnapshot = await snapshot({ ...value, studyHighlightsEnabled: false })
    expect(planSettingsSync([first, second], value).action).toBe("conflict")
  })
  it("bounds decompression even for a small gzip that expands beyond the format limit", async () => {
    const packed = await packSettings(content(), a, { [a]: 1 }),
      compressed = gzipSync(" ".repeat(MAX_RAW_BYTES + 1)),
      encoded = compressed.toString("base64")
    const { id: _id, ...base } = packed.header
    const metadata = {
      ...base,
      compressedHash: sha256(compressed),
      encodedBytes: encoded.length,
      chunks: Math.ceil(encoded.length / CHUNK_LENGTH),
    }
    const header = readHeader({ ...metadata, id: sha256(canonical(metadata)) }, headKey(a)),
      values: Record<string, string> = {}
    for (let n = 0; n < header.chunks; n++)
      values[dataKey(header, n)] = encoded.slice(n * CHUNK_LENGTH, (n + 1) * CHUNK_LENGTH)
    await expect(unpackSettings(header, values)).rejects.toThrow("giới hạn")
  })
})
