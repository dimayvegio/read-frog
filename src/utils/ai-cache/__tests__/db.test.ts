import { Dexie } from "dexie"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  aiCacheDB,
  AiCacheDatabase,
  aiCacheEpoch,
  AI_CACHE_MAX_RECORDS,
  AI_CACHE_MAX_BYTES,
  AI_CACHE_TTL,
  aiCacheKey,
  clearAiCache,
  readAiCache,
  saveAiCache,
} from "../db"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})

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

it("rejects a late completion after cache clear and abort", async () => {
  const epoch = await aiCacheEpoch(),
    key = aiCacheKey("summary", "late")
  await clearAiCache()
  await saveAiCache(key, "summary", "source", "late", epoch)
  expect(await readAiCache(key)).toBeNull()
  const controller = new AbortController()
  controller.abort()
  await saveAiCache(key, "summary", "source", "late", await aiCacheEpoch(), controller.signal)
  expect(await readAiCache(key)).toBeNull()
})
it("bounds record inventory and expires old responses", async () => {
  const now = Date.now()
  await aiCacheDB.completions.bulkPut(
    Array.from({ length: AI_CACHE_MAX_RECORDS + 5 }, (_, i) => ({
      key: aiCacheKey("summary", i),
      kind: "summary" as const,
      original: "x",
      output: "done",
      createdAt: now,
      accessedAt: now + i,
    })),
  )
  await saveAiCache(aiCacheKey("summary", "new"), "summary", "x", "done")
  expect(await aiCacheDB.completions.count()).toBeLessThanOrEqual(AI_CACHE_MAX_RECORDS)
  const key = aiCacheKey("summary", "expired")
  await aiCacheDB.completions.put({
    key,
    kind: "summary",
    original: "x",
    output: "old",
    createdAt: now - AI_CACHE_TTL - 1,
    accessedAt: now,
  })
  expect(await readAiCache(key)).toBeNull()
})

it("clears one document's AI cache and retains another", async () => {
  const a = aiCacheKey("summary", "a"),
    b = aiCacheKey("summary", "b"),
    epoch = await aiCacheEpoch()
  await saveAiCache(a, "summary", "a", "complete a", epoch, undefined, "a".repeat(64))
  await saveAiCache(b, "summary", "b", "complete b", epoch, undefined, "b".repeat(64))
  await clearAiCache("a".repeat(64))
  expect(await readAiCache(a)).toBeNull()
  expect(await readAiCache(b)).toBe("complete b")
  await saveAiCache(a, "summary", "a", "late a", epoch, undefined, "a".repeat(64))
  expect(await readAiCache(a)).toBeNull()
})

it("enforces encoded bytes even below the record cap", async () => {
  const now = Date.now(),
    output = "語".repeat(59000)
  await aiCacheDB.completions.bulkPut(
    Array.from({ length: 100 }, (_, i) => ({
      key: aiCacheKey("explain", i),
      kind: "explain" as const,
      original: "x",
      output,
      createdAt: now,
      accessedAt: now + i,
    })),
  )
  await saveAiCache(aiCacheKey("summary", "new"), "summary", "x", "complete")
  const rows = await aiCacheDB.completions.toArray()
  expect(
    rows.reduce((sum, row) => sum + new TextEncoder().encode(JSON.stringify(row)).length, 0),
  ).toBeLessThanOrEqual(AI_CACHE_MAX_BYTES)
})

it("opens published v1 completions with additive v2 metadata", async () => {
  const name = "ai-cache-migration-fixture"
  const legacy = new Dexie(name)
  legacy.version(1).stores({ completions: "&key, kind, accessedAt" })
  const row = {
    key: "legacy-key",
    kind: "summary",
    original: "original",
    output: "legacy completion",
    createdAt: 1,
    accessedAt: 1,
  }
  await legacy.table("completions").put(row)
  legacy.close()
  const upgraded = new AiCacheDatabase(name)
  expect(await upgraded.completions.get(row.key)).toEqual(row)
  expect(await upgraded.meta.count()).toBe(0)
  await upgraded.delete()
})
