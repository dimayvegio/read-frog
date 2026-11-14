import { beforeEach, describe, expect, it } from "vitest"
import "fake-indexeddb/auto"
import {
  aiCacheDB,
  aiCacheKey,
  clearAiCache,
  readAiCache,
  saveAiCache,
} from "../db"

beforeEach(async () => {
  await clearAiCache()
})

describe("AiCacheDatabase", () => {
  it("computes deterministic cache keys for kinds and payloads", () => {
    const key1 = aiCacheKey("explain", "doc1", "transistor gate")
    const key2 = aiCacheKey("explain", "doc1", "transistor gate")
    const key3 = aiCacheKey("summary", "doc1", "transistor gate")

    expect(key1).toBe(key2)
    expect(key1).not.toBe(key3)
    expect(key1).toMatch(/^[a-f0-9]{64}$/)
  })

  it("saves and reads back completion outputs from cache", async () => {
    const key = aiCacheKey("explain", "docA", "clock skew")
    expect(await readAiCache(key)).toBeNull()

    await saveAiCache(
      key,
      "explain",
      "clock skew",
      "Độ lệch đồng hồ là hiện tượng chênh lệch thời gian đến của tín hiệu clock.",
    )

    const cached = await readAiCache(key)
    expect(cached).toBe(
      "Độ lệch đồng hồ là hiện tượng chênh lệch thời gian đến của tín hiệu clock.",
    )
  })

  it("handles empty or missing keys safely", async () => {
    expect(await readAiCache("")).toBeNull()
    await saveAiCache("", "summary", "abc", "")
    expect(await readAiCache("")).toBeNull()
  })

  it("clears cached entries properly", async () => {
    const key = aiCacheKey("page-summary", 5, "content")
    await saveAiCache(key, "page-summary", "content", "Tóm tắt trang 5")
    expect(await readAiCache(key)).toBe("Tóm tắt trang 5")

    await clearAiCache()
    expect(await readAiCache(key)).toBeNull()
  })
})
