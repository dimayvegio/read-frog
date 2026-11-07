import JSZip from "jszip"
import { z } from "zod"
import { validateReadingAsset } from "./db"
import {
  MAX_READING_ARCHIVE,
  MAX_READING_ASSET,
  readingFolderSchema,
  readingPassageSchema,
  referencedReadingAssets,
  validateReadingPassage,
  type ReadingBundle,
  type ReadingAsset,
} from "./schema"

const manifestSchema = z.strictObject({
  format: z.literal("read-frog-reading-library"),
  version: z.literal(1),
  exportedAt: z.number().int().nonnegative(),
  passages: z.array(readingPassageSchema).max(100),
  folders: z.array(readingFolderSchema).max(50),
  assets: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-f0-9]{64}$/),
        type: z.enum(["audio/mpeg", "audio/webm", "audio/mp4", "audio/ogg"]),
      }),
    )
    .max(5000),
})
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function inspect(bytes: Uint8Array) {
  if (bytes.length < 22 || bytes.length > MAX_READING_ARCHIVE)
    throw new Error("ZIP không hợp lệ hoặc vượt 64 MiB.")
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = bytes.length - 22
  while (end >= Math.max(0, bytes.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--
  if (
    end < 0 ||
    view.getUint32(end, true) !== 0x06054b50 ||
    end + 22 + view.getUint16(end + 20, true) !== bytes.length
  )
    throw new Error("Mục lục ZIP lỗi.")
  const count = view.getUint16(end + 10, true),
    offset = view.getUint32(end + 16, true),
    size = view.getUint32(end + 12, true)
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    count !== view.getUint16(end + 8, true) ||
    count > 5001 ||
    offset + size !== end
  )
    throw new Error("Không hỗ trợ ZIP này.")
  const entries = new Map<string, { size: number; crc: number }>()
  let cursor = offset,
    total = 0
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("Mục lục ZIP lỗi.")
    const flags = view.getUint16(cursor + 8, true),
      method = view.getUint16(cursor + 10, true),
      expanded = view.getUint32(cursor + 24, true),
      length = view.getUint16(cursor + 28, true)
    const next =
      cursor + 46 + length + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true)
    if (
      next > end ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      view.getUint16(cursor + 34, true) ||
      view.getUint32(cursor + 20, true) > bytes.length ||
      view.getUint32(cursor + 42, true) >= offset
    )
      throw new Error("ZIP mã hóa hoặc lỗi.")
    const name = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(cursor + 46, cursor + 46 + length),
    )
    if (!/^(manifest\.json|audio\/[a-f0-9]{64})$/.test(name) || entries.has(name))
      throw new Error("ZIP chứa file lạ/trùng.")
    if (expanded > (name === "manifest.json" ? 8 * 1024 * 1024 : MAX_READING_ASSET))
      throw new Error("File trong ZIP quá lớn.")
    total += expanded
    if (total > MAX_READING_ARCHIVE) throw new Error("ZIP giải nén vượt 64 MiB.")
    entries.set(name, { size: expanded, crc: view.getUint32(cursor + 16, true) })
    cursor = next
  }
  if (cursor !== end || !entries.has("manifest.json")) throw new Error("ZIP thiếu manifest.")
  return entries
}
async function readBounded(zip: JSZip, name: string, info: { size: number; crc: number }) {
  const entry = zip.file(name)
  if (!entry) throw new Error("ZIP thiếu file.")
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = []
    let crc = 0xffffffff
    let size = 0,
      settled = false
    const stream = (
      entry as JSZip.JSZipObject & {
        internalStream: (type: "uint8array") => JSZip.JSZipStreamHelper<Uint8Array>
      }
    ).internalStream("uint8array")
    const fail = (error: unknown) => {
      if (!settled) {
        settled = true
        stream.pause()
        chunks.length = 0
        reject(error)
      }
    }
    stream
      .on("data", (chunk) => {
        if (settled) return
        size += chunk.length
        if (size > info.size) fail(new Error("ZIP giải nén vượt khai báo."))
        else {
          for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8)
          chunks.push(chunk)
        }
      })
      .on("error", fail)
      .on("end", () => {
        if (settled) return
        if (size !== info.size || (crc ^ 0xffffffff) >>> 0 !== info.crc) {
          fail(new Error("Kích thước/CRC32 ZIP lỗi."))
          return
        }
        settled = true
        const bytes = new Uint8Array(size)
        let at = 0
        for (const chunk of chunks) {
          bytes.set(chunk, at)
          at += chunk.length
        }
        resolve(bytes)
      })
      .resume()
  })
}
export async function writeReadingArchive(bundle: ReadingBundle, includeRecordings = false) {
  const passages = bundle.passages.map((passage) =>
    validateReadingPassage({
      ...passage,
      pairs: passage.pairs.map((pair) => ({
        ...pair,
        recording: includeRecordings ? pair.recording : null,
      })),
    }),
  )
  const used = new Set(passages.flatMap(referencedReadingAssets)),
    assets = bundle.assets.filter((asset) => used.has(asset.id))
  if (used.size !== assets.length) throw new Error("Thiếu hoặc trùng audio khi xuất.")
  assets.forEach(validateReadingAsset)
  const manifest = manifestSchema.parse({
    format: "read-frog-reading-library",
    version: 1,
    exportedAt: Date.now(),
    passages,
    folders: bundle.folders,
    assets: assets.map(({ id, type }) => ({ id, type })),
  })
  const text = JSON.stringify(manifest),
    size =
      new TextEncoder().encode(text).length +
      assets.reduce((sum, asset) => sum + asset.bytes.length, 0)
  if (size > MAX_READING_ARCHIVE) throw new Error("ZIP vượt 64 MiB; chọn ít đoạn hơn để xuất.")
  const zip = new JSZip().file("manifest.json", text)
  for (const asset of assets) zip.file(`audio/${asset.id}`, asset.bytes, { createFolders: false })
  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  })
  inspect(bytes)
  return bytes
}
export async function readReadingArchive(bytes: Uint8Array): Promise<ReadingBundle> {
  const entries = inspect(bytes),
    zip = await JSZip.loadAsync(bytes)
  const manifest = manifestSchema.parse(
    JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await readBounded(zip, "manifest.json", entries.get("manifest.json")!),
      ),
    ),
  )
  const ids = new Set(manifest.assets.map((asset) => asset.id)),
    passageIds = new Set(manifest.passages.map((passage) => passage.id)),
    folderIds = new Set(manifest.folders.map((folder) => folder.id))
  if (
    ids.size !== manifest.assets.length ||
    passageIds.size !== manifest.passages.length ||
    folderIds.size !== manifest.folders.length ||
    entries.size !== ids.size + 1
  )
    throw new Error("ZIP có dữ liệu trùng/lạ.")
  for (const passage of manifest.passages) {
    validateReadingPassage(passage)
    if (passage.folderId && !folderIds.has(passage.folderId)) throw new Error("ZIP thiếu thư mục.")
    for (const id of referencedReadingAssets(passage))
      if (!ids.has(id)) throw new Error("ZIP thiếu audio.")
  }
  const assets: ReadingAsset[] = []
  for (const asset of manifest.assets) {
    const name = `audio/${asset.id}`,
      size = entries.get(name)
    if (size === undefined) throw new Error("ZIP thiếu audio.")
    assets.push(validateReadingAsset({ ...asset, bytes: await readBounded(zip, name, size) }))
  }
  return { passages: manifest.passages, folders: manifest.folders, assets }
}
