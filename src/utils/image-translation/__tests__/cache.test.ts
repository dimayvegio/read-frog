import { beforeEach, expect, it, vi } from "vitest"
import {
  imageCacheDB,
  imageCacheKey,
  readImageCache,
  saveImageCache,
  clearImageCache,
  IMAGE_CACHE_LIMIT,
  IMAGE_CACHE_BYTES,
  IMAGE_CACHE_TTL,
} from "../cache"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
const signal = () => new AbortController().signal
beforeEach(async () => {
  vi.restoreAllMocks()
  for (const table of imageCacheDB.tables) await table.clear()
})
it("stores only bounded recognized text and output under hashes, deduplicating updates", async () => {
  const key = imageCacheKey("ocr", "photo")
  await saveImageCache(key, "ocr", { original: "Hello" }, 0, signal())
  await saveImageCache(key, "ocr", { original: "Updated" }, 0, signal())
  expect(await readImageCache(key)).toEqual({ epoch: 0, value: { original: "Updated" } })
  expect(await imageCacheDB.entries.count()).toBe(1)
  expect(JSON.stringify(await imageCacheDB.entries.toArray())).not.toMatch(
    /data:image|base64|apiKey|file:\/\/|photo/,
  )
  await expect(
    saveImageCache(
      key,
      "ocr",
      { original: "Text", image: "data:image/png;base64,secret" } as any,
      0,
      signal(),
    ),
  ).rejects.toThrow("Unrecognized key")
})
it("expires old entries and preserves exact byte/count accounting", async () => {
  const key = imageCacheKey("expired"),
    now = Date.now()
  await saveImageCache(key, "text", { original: "Text", translation: "Bản dịch" }, 0, signal())
  vi.spyOn(Date, "now").mockReturnValue(now + IMAGE_CACHE_TTL + 100)
  expect((await readImageCache(key)).value).toBeNull()
  expect(await imageCacheDB.meta.get("state")).toMatchObject({ count: 0, bytes: 0 })
})
it("clear epochs and cancellation prevent late requests from repopulating the cache", async () => {
  const key = imageCacheKey("race"),
    epoch = (await readImageCache(key)).epoch
  await clearImageCache()
  expect(await saveImageCache(key, "ocr", { original: "Old" }, epoch, signal())).toBe(false)
  const aborted = new AbortController()
  aborted.abort()
  await expect(
    saveImageCache(key, "ocr", { original: "Aborted" }, 1, aborted.signal),
  ).rejects.toThrow(/abort/i)
  expect(await imageCacheDB.entries.count()).toBe(0)
  expect(await saveImageCache(key, "ocr", { original: "New" }, 1, signal())).toBe(true)
})
it("evicts the least recently used entries at the record limit", async () => {
  let now = 1000
  vi.spyOn(Date, "now").mockImplementation(() => now++)
  for (let i = 0; i < IMAGE_CACHE_LIMIT; i++)
    await saveImageCache(imageCacheKey(i), "ocr", { original: "Text" }, 0, signal())
  await readImageCache(imageCacheKey(0))
  await saveImageCache(imageCacheKey("new"), "ocr", { original: "New" }, 0, signal())
  expect(await imageCacheDB.entries.count()).toBe(IMAGE_CACHE_LIMIT)
  expect((await readImageCache(imageCacheKey(0))).value).not.toBeNull()
  expect((await readImageCache(imageCacheKey(1))).value).toBeNull()
})
it("keeps the byte budget bounded with large OCR/translation pairs", async () => {
  let now = 1000
  vi.spyOn(Date, "now").mockImplementation(() => now++)
  for (let i = 0; i < 220; i++)
    await saveImageCache(
      imageCacheKey(i),
      "fast",
      { original: "a".repeat(20000), translation: "b".repeat(60000) },
      0,
      signal(),
    )
  const rows = await imageCacheDB.entries.toArray(),
    state = await imageCacheDB.meta.get("state")
  expect(state!.bytes).toBeLessThanOrEqual(IMAGE_CACHE_BYTES)
  expect(state!.count).toBe(rows.length)
  expect(state!.bytes).toBe(rows.reduce((sum, row) => sum + row.bytes, 0))
  expect(rows.length).toBeLessThan(220)
})
