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
  constructor(name = "read-frog-ai-cache") {
    super(name)
    this.version(1).stores({
      completions: "&key, kind, accessedAt",
    })
  }
}

export const aiCacheDB = new AiCacheDatabase()

// In-memory LRU map for zero-latency lookups in the same session
const memCache = new Map<string, string>()
const MAX_MEM_CACHE = 500

export function aiCacheKey(kind: AiCacheKind, ...parts: unknown[]): string {
  return sha256(JSON.stringify([kind, ...parts]))
}

export async function readAiCache(key: string): Promise<string | null> {
  if (!key) return null
  if (memCache.has(key)) return memCache.get(key)!
  try {
    const row = await aiCacheDB.completions.get(key)
    if (!row) return null
    if (memCache.size >= MAX_MEM_CACHE) {
      const first = memCache.keys().next().value
      if (first !== undefined) memCache.delete(first)
    }
    memCache.set(key, row.output)
    void aiCacheDB.completions.update(key, { accessedAt: Date.now() }).catch(() => {})
    return row.output
  } catch {
    return null
  }
}

export async function saveAiCache(
  key: string,
  kind: AiCacheKind,
  original: string,
  output: string,
): Promise<void> {
  if (!key || !output.trim()) return
  if (memCache.size >= MAX_MEM_CACHE) {
    const first = memCache.keys().next().value
    if (first !== undefined) memCache.delete(first)
  }
  memCache.set(key, output)
  try {
    const now = Date.now()
    await aiCacheDB.completions.put({
      key,
      kind,
      original: original.slice(0, 10000),
      output: output.slice(0, 60000),
      createdAt: now,
      accessedAt: now,
    })
  } catch {}
}

export async function clearAiCache(): Promise<void> {
  memCache.clear()
  try {
    await aiCacheDB.completions.clear()
  } catch {}
}
