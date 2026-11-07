import { Dexie, type Table } from "dexie"
import { sha256 } from "js-sha256"
import { z } from "zod"
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const valueSchema = z.strictObject({
  original: z.string().min(1).max(20000),
  translation: z.string().min(1).max(60000).optional(),
})
const rowSchema = valueSchema.extend({
  key: hash,
  kind: z.enum(["ocr", "fast", "text"]),
  createdAt: z.number().int().nonnegative(),
  accessedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  bytes: z.number().int().positive(),
})
type Row = z.infer<typeof rowSchema>
interface State {
  key: "state"
  epoch: number
  count: number
  bytes: number
}
export class ImageCacheDatabase extends Dexie {
  entries!: Table<Row, string>
  meta!: Table<State, string>
  constructor(name = "read-frog-image-cache") {
    super(name)
    // Published snapshots must remain literal and frozen.
    this.version(1).stores({ entries: "&key, accessedAt, expiresAt", meta: "&key" })
  }
}
export const imageCacheDB = new ImageCacheDatabase()
export const IMAGE_CACHE_LIMIT = 500
export const IMAGE_CACHE_BYTES = 16 * 1024 * 1024
export const IMAGE_CACHE_TTL = 30 * 24 * 60 * 60 * 1000
export const imageCacheKey = (...identity: unknown[]) =>
  sha256(JSON.stringify(["image-cache-v1", ...identity]))
const empty = (): State => ({ key: "state", epoch: 0, count: 0, bytes: 0 })
export async function readImageCache(key: string) {
  hash.parse(key)
  return imageCacheDB.transaction("rw", imageCacheDB.tables, async () => {
    const state = (await imageCacheDB.meta.get("state")) ?? empty(),
      row = await imageCacheDB.entries.get(key)
    if (!row) return { epoch: state.epoch, value: null }
    const valid = rowSchema.safeParse(row)
    if (!valid.success || row.expiresAt <= Date.now()) {
      await imageCacheDB.entries.delete(key)
      await imageCacheDB.meta.put({
        ...state,
        count: Math.max(0, state.count - 1),
        bytes: Math.max(0, state.bytes - (row.bytes || 0)),
      })
      return { epoch: state.epoch, value: null }
    }
    await imageCacheDB.entries.update(key, { accessedAt: Date.now() })
    return {
      epoch: state.epoch,
      value: valueSchema.parse({
        original: row.original,
        ...(row.translation ? { translation: row.translation } : {}),
      }),
    }
  })
}
export async function saveImageCache(
  key: string,
  kind: Row["kind"],
  input: z.infer<typeof valueSchema>,
  epoch: number,
  signal: AbortSignal,
) {
  hash.parse(key)
  const value = valueSchema.parse(input)
  if (kind !== "ocr" && !value.translation) throw new Error("Missing cached translation")
  const now = Date.now(),
    base = {
      ...value,
      key,
      kind,
      createdAt: now,
      accessedAt: now,
      expiresAt: now + IMAGE_CACHE_TTL,
    }
  const row = rowSchema.parse({
    ...base,
    bytes: new TextEncoder().encode(JSON.stringify({ ...base, bytes: 0 })).length + 16,
  })
  return imageCacheDB.transaction("rw", imageCacheDB.tables, async () => {
    signal.throwIfAborted()
    const state = (await imageCacheDB.meta.get("state")) ?? empty()
    if (state.epoch !== epoch) return false
    const expired = await imageCacheDB.entries.where("expiresAt").belowOrEqual(now).toArray()
    for (const old of expired) {
      await imageCacheDB.entries.delete(old.key)
      state.count--
      state.bytes -= old.bytes
    }
    const old = await imageCacheDB.entries.get(key)
    if (old) {
      await imageCacheDB.entries.delete(key)
      state.count--
      state.bytes -= old.bytes
    }
    while (state.count >= IMAGE_CACHE_LIMIT || state.bytes + row.bytes > IMAGE_CACHE_BYTES) {
      const oldest = await imageCacheDB.entries.orderBy("accessedAt").first()
      if (!oldest) break
      await imageCacheDB.entries.delete(oldest.key)
      state.count--
      state.bytes -= oldest.bytes
    }
    await imageCacheDB.entries.put(row)
    await imageCacheDB.meta.put({
      ...state,
      count: state.count + 1,
      bytes: state.bytes + row.bytes,
    })
    signal.throwIfAborted()
    return true
  })
}
export async function clearImageCache() {
  return imageCacheDB.transaction("rw", imageCacheDB.tables, async () => {
    const state = (await imageCacheDB.meta.get("state")) ?? empty()
    await imageCacheDB.entries.clear()
    await imageCacheDB.meta.put({ ...empty(), epoch: state.epoch + 1 })
  })
}
