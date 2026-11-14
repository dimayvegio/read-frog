import { Dexie, type Table } from "dexie"
import { sha256 } from "js-sha256"

export type AiCacheKind = "explain" | "summary" | "page-summary" | "quick-dict" | "translate"
export interface AiCacheRecord {
  key: string
  kind: AiCacheKind
  original: string
  output: string
  createdAt: number
  accessedAt: number
}
export class AiCacheDatabase extends Dexie {
  completions!: Table<AiCacheRecord, string>
  meta!: Table<{ key: string; epoch: number }, string>
  constructor(name = "read-frog-ai-cache") {
    super(name)
    this.version(1).stores({ completions: "&key, kind, accessedAt" })
    // Additive store; published completion records and the v1 declaration stay readable.
    this.version(2).stores({ meta: "&key" })
  }
}
export const aiCacheDB = new AiCacheDatabase()
export const AI_CACHE_MAX_RECORDS = 500
export const AI_CACHE_MAX_BYTES = 16 * 1024 * 1024
export const AI_CACHE_TTL = 30 * 86400000
const bytes = (row: AiCacheRecord) => new TextEncoder().encode(JSON.stringify(row)).length
export const aiCacheKey = (kind: AiCacheKind, ...parts: unknown[]) =>
  sha256(JSON.stringify(["complete-only-v2", kind, ...parts]))
export async function aiCacheEpoch() {
  return (await aiCacheDB.meta.get("epoch"))?.epoch ?? 0
}
export async function readAiCache(key: string): Promise<string | null> {
  if (!key) return null
  try {
    return await aiCacheDB.transaction("rw", aiCacheDB.completions, async () => {
      const row = await aiCacheDB.completions.get(key)
      if (!row) return null
      if (
        !Number.isFinite(row.createdAt) ||
        Date.now() - row.createdAt > AI_CACHE_TTL ||
        typeof row.output !== "string" ||
        !row.output.trim() ||
        row.output.length > 60000
      ) {
        await aiCacheDB.completions.delete(key)
        return null
      }
      await aiCacheDB.completions.update(key, { accessedAt: Date.now() })
      return row.output
    })
  } catch {
    return null
  }
}
export async function saveAiCache(
  key: string,
  kind: AiCacheKind,
  original: string,
  output: string,
  epoch?: number,
  signal?: AbortSignal,
  documentId?: string,
): Promise<void> {
  if (!key || !output.trim() || output.length > 60000) return
  try {
    await aiCacheDB.transaction("rw", aiCacheDB.completions, aiCacheDB.meta, async () => {
      const current = await aiCacheEpoch()
      if (signal?.aborted || (epoch !== undefined && epoch !== current)) return
      const now = Date.now()
      await aiCacheDB.completions.put({
        key,
        kind,
        original: original.slice(0, 10000),
        output,
        createdAt: now,
        accessedAt: now,
      })
      if (documentId)
        await aiCacheDB.meta.put({ key: `scope:${documentId}:${key}`, epoch: current })
      let total = 0,
        offset = 0
      const retained = new Set<string>()
      // Bound memory even when upgrading a legacy cache that had no inventory limit.
      while (true) {
        const rows = await aiCacheDB.completions
          .orderBy("accessedAt")
          .reverse()
          .offset(offset)
          .limit(64)
          .toArray()
        if (!rows.length) break
        const stale: string[] = []
        for (const row of rows) {
          const size = bytes(row)
          if (
            now - row.createdAt > AI_CACHE_TTL ||
            retained.size >= AI_CACHE_MAX_RECORDS ||
            total + size > AI_CACHE_MAX_BYTES
          )
            stale.push(row.key)
          else {
            retained.add(row.key)
            offset++
            total += size
          }
        }
        await aiCacheDB.completions.bulkDelete(stale)
        signal?.throwIfAborted()
      }
      const markers = await aiCacheDB.meta.where("key").startsWith("scope:").primaryKeys()
      await aiCacheDB.meta.bulkDelete(
        markers.filter((marker) => !retained.has(marker.split(":").at(-1)!)),
      )
      signal?.throwIfAborted()
    })
  } catch {
    signal?.throwIfAborted()
  }
}
export async function clearAiCache(documentId?: string): Promise<void> {
  await aiCacheDB.transaction("rw", aiCacheDB.completions, aiCacheDB.meta, async () => {
    const epoch = await aiCacheEpoch()
    if (documentId) {
      const markers = await aiCacheDB.meta
        .where("key")
        .startsWith(`scope:${documentId}:`)
        .primaryKeys()
      await aiCacheDB.completions.bulkDelete(markers.map((key) => key.split(":").at(-1)!))
      await aiCacheDB.meta.bulkDelete(markers)
    } else {
      await aiCacheDB.completions.clear()
      await aiCacheDB.meta.clear()
    }
    await aiCacheDB.meta.put({ key: "epoch", epoch: epoch + 1 })
  })
}
