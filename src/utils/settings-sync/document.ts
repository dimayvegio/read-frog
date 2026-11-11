import type { Config } from "@/types/config/config"
import { sha256 } from "js-sha256"
import { z } from "zod"
import { migrate as upgradeLanguages } from "@/utils/config/migration-scripts/v124-to-v125"
import { toPortableConfig } from "@/utils/config/portable"

export const SYNC_PREFIX = "rf-config:"
export const MAX_RAW_BYTES = 1024 * 1024
export const MAX_ENCODED_BYTES = 32000
export const CHUNK_LENGTH = 6000
export const SYNC_BUDGET = 90000
export const MAX_DEVICES = 16
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const clockSchema = z
  .record(z.string().uuid(), z.number().int().min(0).max(1e9))
  .refine((value) => Object.keys(value).length <= MAX_DEVICES)
export type SyncClock = z.infer<typeof clockSchema>
// Published transport v1 describes fork config124. Future schemas need a new
// reader/writer; never project unknown settings away and upload the remainder.
export const headerSchema = z.strictObject({
  format: z.literal("read-frog-edge-settings"),
  version: z.literal(1),
  schemaVersion: z.literal(124),
  codec: z.literal("gzip"),
  device: z.string().uuid(),
  at: z.number().int().nonnegative(),
  clock: clockSchema,
  contentHash: hashSchema,
  compressedHash: hashSchema,
  chunks: z.number().int().min(1).max(6),
  encodedBytes: z.number().int().min(1).max(MAX_ENCODED_BYTES),
  id: hashSchema,
})
export const currentHeaderSchema = headerSchema.extend({
  version: z.literal(2),
  schemaVersion: z.literal(125),
})
export type SyncHeader = z.infer<typeof headerSchema> | z.infer<typeof currentHeaderSchema>
export interface SettingsContent {
  config: Config
  studyHighlightsEnabled: boolean
}
export interface SettingsSnapshot {
  header: SyncHeader
  content: SettingsContent
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`
  return JSON.stringify(value) ?? "null"
}
export const contentHash = (content: SettingsContent) => sha256(canonical(content))
export function readSettingsContent(raw: unknown, schemaVersion: 124 | 125 = 125): SettingsContent {
  const value = z
    .strictObject({ config: z.unknown(), studyHighlightsEnabled: z.boolean() })
    .parse(raw)
  const config = toPortableConfig(value.config)
  const expected = schemaVersion === 124 ? upgradeLanguages(value.config) : value.config
  if (canonical(config) !== canonical(expected))
    throw new Error(
      "Cấu hình chứa trường không được hỗ trợ hoặc credential. Hãy cập nhật extension trước.",
    )
  return { config, studyHighlightsEnabled: value.studyHighlightsEnabled }
}
export const headKey = (device: string) => `${SYNC_PREFIX}head:${device}`
export const dataKey = (header: SyncHeader, index: number) =>
  `${SYNC_PREFIX}data:${header.device}:${header.id}:${index}`
export const mergeClocks = (...clocks: SyncClock[]): SyncClock => {
  const merged: SyncClock = {}
  for (const clock of clocks)
    for (const [device, count] of Object.entries(clock))
      merged[device] = Math.max(merged[device] ?? 0, count)
  return clockSchema.parse(merged)
}
export function dominates(left: SyncClock, right: SyncClock) {
  return (
    Object.entries(right).every(([device, count]) => (left[device] ?? 0) >= count) &&
    Object.entries(left).some(([device, count]) => count > (right[device] ?? 0))
  )
}
async function collect(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader(),
    parts: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.length
      if (size > limit) {
        await reader.cancel()
        throw new Error("Cấu hình vượt giới hạn đồng bộ Edge.")
      }
      parts.push(part.value)
    }
  } finally {
    reader.releaseLock()
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}
async function transformBytes(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
  limit: number,
) {
  const writer = transform.writable.getWriter()
  const writing = writer.write(new Uint8Array(bytes).buffer).then(() => writer.close())
  try {
    const [, result] = await Promise.all([writing, collect(transform.readable, limit)])
    return result
  } finally {
    writer.releaseLock()
  }
}
export async function packSettings(
  content: SettingsContent,
  device: string,
  clock: SyncClock,
  at = Date.now(),
) {
  const safe = readSettingsContent(content),
    raw = new TextEncoder().encode(canonical(safe))
  if (raw.length > MAX_RAW_BYTES)
    throw new Error("Cấu hình trước nén vượt 1 MiB; hãy dùng xuất file.")
  const compressed = await transformBytes(
    raw,
    new CompressionStream("gzip"),
    MAX_ENCODED_BYTES * 0.75,
  )
  const encoded = btoa(String.fromCharCode(...compressed))
  if (encoded.length > MAX_ENCODED_BYTES)
    throw new Error("Cấu hình sau nén quá lớn cho đồng bộ Edge; hãy dùng xuất file.")
  const metadata = {
    format: "read-frog-edge-settings" as const,
    version: 2 as const,
    schemaVersion: 125 as const,
    codec: "gzip" as const,
    device,
    clock,
    at,
    contentHash: contentHash(safe),
    compressedHash: sha256(compressed),
    chunks: Math.ceil(encoded.length / CHUNK_LENGTH),
    encodedBytes: encoded.length,
  }
  const header = currentHeaderSchema.parse({ ...metadata, id: sha256(canonical(metadata)) })
  const values: Record<string, string> = {}
  for (let n = 0; n < header.chunks; n++)
    values[dataKey(header, n)] = encoded.slice(n * CHUNK_LENGTH, (n + 1) * CHUNK_LENGTH)
  return { header, values }
}
export function readHeader(raw: unknown, key: string) {
  const header = z.union([headerSchema, currentHeaderSchema]).parse(raw),
    { id, ...metadata } = header
  if (
    key !== headKey(header.device) ||
    sha256(canonical(metadata)) !== id ||
    !header.clock[header.device]
  )
    throw new Error("Bản đồng bộ Edge không hợp lệ.")
  return header
}
export async function unpackSettings(
  header: SyncHeader,
  values: Record<string, unknown>,
): Promise<SettingsSnapshot | null> {
  let encoded = ""
  for (let n = 0; n < header.chunks; n++) {
    const part = values[dataKey(header, n)]
    if (part === undefined) return null // Remote sync can deliver the head first.
    if (typeof part !== "string" || part.length > CHUNK_LENGTH)
      throw new Error("Khối cấu hình đồng bộ không hợp lệ.")
    encoded += part
  }
  if (encoded.length !== header.encodedBytes) throw new Error("Bản đồng bộ sai kích thước.")
  const compressed = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))
  if (sha256(compressed) !== header.compressedHash) throw new Error("Bản đồng bộ sai checksum.")
  const decoded = await transformBytes(compressed, new DecompressionStream("gzip"), MAX_RAW_BYTES)
  const raw: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded))
  // Check exact published bytes/content before upgrading a legacy v1 payload.
  if (sha256(canonical(raw)) !== header.contentHash)
    throw new Error("Nội dung đồng bộ sai checksum.")
  const content = readSettingsContent(raw, header.schemaVersion)
  return { header, content }
}
export function planSettingsSync(
  snapshots: SettingsSnapshot[],
  local: SettingsContent,
  baseHash?: string,
  baseClock: SyncClock = {},
) {
  const heads = snapshots.filter(
    (row) =>
      !snapshots.some((other) => other !== row && dominates(other.header.clock, row.header.clock)),
  )
  const legacyBase = snapshots.find(
    (row) => row.header.version === 1 && row.header.contentHash === baseHash,
  )
  const comparisonBase = legacyBase ? contentHash(legacyBase.content) : baseHash
  const localHash = contentHash(local),
    hashes = new Set(heads.map((row) => contentHash(row.content)))
  if (!heads.length) return { action: "push" as const, heads }
  if (hashes.size > 1) return { action: "conflict" as const, heads }
  const incoming = heads[0]!
  if (contentHash(incoming.content) === localHash)
    return { action: "agreed" as const, heads, incoming }
  if (contentHash(incoming.content) === comparisonBase) return { action: "push" as const, heads }
  const remoteClock = mergeClocks(...heads.map((row) => row.header.clock))
  if (
    localHash === comparisonBase &&
    (dominates(remoteClock, baseClock) || canonical(remoteClock) === canonical(baseClock))
  )
    return { action: "pull" as const, heads, incoming }
  return { action: "conflict" as const, heads }
}

/** Local DB1 recovery rows may predate config125; never rewrite their bytes. */
export function readRestorableSettingsContent(raw: unknown): SettingsContent {
  try {
    return readSettingsContent(raw)
  } catch {
    return readSettingsContent(raw, 124)
  }
}
