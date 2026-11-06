import JSZip from "jszip"
import { z } from "zod"
import { compressVocabularyBundle, isMp3 } from "./audio"
import {
  reviewEventSchema,
  reviewEventV4Schema,
  MAX_REVIEW_EVENTS,
  MAX_REVIEW_LOG_BYTES,
} from "./review-log"
import {
  cardSchema,
  progressSchema,
  validateLearningContent,
  learningContentFromCard,
  isWav,
  sha256,
  MAX_ARCHIVE_BYTES,
  MAX_AUDIO_BYTES,
  MAX_CARDS,
  notebookSchema,
  type VocabularyBundle,
} from "./schema"

const FORMAT = "read-frog-vocabulary"
interface EntryInfo {
  size: number
  crc: number
}
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crc32(bytes: Uint8Array) {
  let value = 0xffffffff
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255]! ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}
const manifestV1Schema = z.strictObject({
  format: z.literal(FORMAT),
  version: z.literal(1),
  title: z.string().max(160),
  exportedAt: z.number().int().nonnegative(),
  cardCount: z.number().int().min(0).max(MAX_CARDS),
})
const manifestSchema = z.discriminatedUnion("version", [
  manifestV1Schema,
  manifestV1Schema.extend({ version: z.literal(2), notebook: notebookSchema }),
  manifestV1Schema.extend({ version: z.literal(3), notebook: notebookSchema.optional() }),
  manifestV1Schema.extend({
    version: z.literal(4),
    notebook: notebookSchema.optional(),
    reviewCount: z.number().int().min(0).max(MAX_REVIEW_EVENTS),
  }),
  manifestV1Schema.extend({
    version: z.literal(5),
    notebook: notebookSchema.optional(),
    reviewCount: z.number().int().min(0).max(MAX_REVIEW_EVENTS),
  }),
])

// Bound expanded data BEFORE a ZIP library inflates anything. We accept only
// single-volume, unencrypted ZIP32 archives with the documented file names.
export function inspectZip(bytes: Uint8Array, metadata?: Map<string, EntryInfo>) {
  if (bytes.length > MAX_ARCHIVE_BYTES || bytes.length < 22)
    throw new Error("ZIP không hợp lệ hoặc vượt 64 MB.")
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = bytes.length - 22
  while (end >= Math.max(0, bytes.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--
  if (
    end < 0 ||
    view.getUint32(end, true) !== 0x06054b50 ||
    end + 22 + view.getUint16(end + 20, true) !== bytes.length
  )
    throw new Error("Không tìm thấy mục lục ZIP.")
  const count = view.getUint16(end + 10, true),
    offset = view.getUint32(end + 16, true),
    size = view.getUint32(end + 12, true)
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    count !== view.getUint16(end + 8, true) ||
    count > MAX_CARDS * 2 + 4 ||
    offset + size !== end
  )
    throw new Error("Không hỗ trợ định dạng ZIP này.")
  let cursor = offset,
    total = 0
  const names = new Set<string>()
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("Mục lục ZIP bị lỗi.")
    const flags = view.getUint16(cursor + 8, true),
      method = view.getUint16(cursor + 10, true),
      expanded = view.getUint32(cursor + 24, true),
      nameLength = view.getUint16(cursor + 28, true)
    const next =
      cursor +
      46 +
      nameLength +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true)
    if (
      next > end ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      view.getUint16(cursor + 34, true) ||
      view.getUint32(cursor + 20, true) > bytes.length ||
      view.getUint32(cursor + 42, true) >= offset
    )
      throw new Error("ZIP mã hóa hoặc bị lỗi.")
    const name = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    )
    if (
      !/^(manifest\.json|vocabulary\.json|progress\.json|reviews\.json|audio\/[a-f0-9]{64}\.(wav|mp3))$/.test(
        name,
      ) ||
      names.has(name)
    )
      throw new Error("ZIP chứa tên file không được hỗ trợ.")
    if (
      expanded >
      (name === "reviews.json"
        ? MAX_REVIEW_LOG_BYTES
        : name.startsWith("audio/")
          ? MAX_AUDIO_BYTES
          : 4 * 1024 * 1024)
    )
      throw new Error("Một file trong bộ từ quá lớn.")
    total += expanded
    if (total > MAX_ARCHIVE_BYTES) throw new Error("Dữ liệu giải nén vượt 64 MB.")
    names.add(name)
    metadata?.set(name, { size: expanded, crc: view.getUint32(cursor + 16, true) })
    cursor = next
  }
  if (
    cursor !== end ||
    !["manifest.json", "vocabulary.json", "progress.json"].every((n) => names.has(n))
  )
    throw new Error("ZIP thiếu dữ liệu từ vựng.")
  return names
}

function readCheckedEntry(zip: JSZip, name: string, info: EntryInfo): Promise<Uint8Array> {
  const entry = zip.file(name)
  if (!entry) return Promise.reject(new Error("ZIP thiếu file dữ liệu."))
  return new Promise((resolve, reject) => {
    let size = 0,
      settled = false
    const chunks: Uint8Array[] = []
    // JSZip 3.10.2 exposes internalStream in lib/zipObject.js but omits it
    // from JSZipObject's bundled types; JSZipStreamHelper itself is typed.
    const stream = (
      entry as JSZip.JSZipObject & {
        internalStream: (type: "uint8array") => JSZip.JSZipStreamHelper<Uint8Array>
      }
    ).internalStream("uint8array")
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      stream.pause()
      chunks.length = 0
      reject(error)
    }
    stream
      .on("data", (chunk) => {
        if (settled) return
        size += chunk.length
        // Also enforce the ACTUAL output limit: central-directory sizes can lie.
        if (size > info.size) {
          fail(new Error("Dữ liệu giải nén vượt kích thước đã khai báo."))
          return
        }
        chunks.push(chunk)
      })
      .on("error", fail)
      .on("end", () => {
        if (settled) return
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) {
          bytes.set(chunk, offset)
          offset += chunk.length
        }
        if (size !== info.size || crc32(bytes) !== info.crc) {
          fail(new Error("ZIP bị hỏng (kích thước/CRC32)."))
          return
        }
        settled = true
        chunks.length = 0
        resolve(bytes)
      })
      .resume()
  })
}

export async function createVocabularyZip(bundle: VocabularyBundle): Promise<Uint8Array> {
  bundle = await compressVocabularyBundle(bundle)
  const zip = new JSZip()
  zip.file(
    "manifest.json",
    JSON.stringify({
      format: FORMAT,
      version: 5,
      reviewCount: bundle.events?.length ?? 0,
      title: bundle.notebook?.name ?? "Từ vựng của tôi",
      exportedAt: Date.now(),
      cardCount: bundle.cards.length,
      ...(bundle.notebook ? { notebook: bundle.notebook } : {}),
    }),
  )
  zip.file("vocabulary.json", JSON.stringify(bundle.cards))
  zip.file("progress.json", JSON.stringify(bundle.progress))
  zip.file("reviews.json", JSON.stringify(bundle.events ?? []))
  const used = new Set(bundle.cards.flatMap((c) => [c.audio.word, c.audio.example]))
  for (const asset of bundle.audio)
    if (used.has(asset.id))
      zip.file(
        `audio/${asset.id}.${asset.contentType === "audio/mpeg" ? "mp3" : "wav"}`,
        asset.bytes,
        { createFolders: false },
      )
  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  })
  inspectZip(bytes)
  return bytes
}
export async function readVocabularyZip(bytes: Uint8Array): Promise<VocabularyBundle> {
  const metadata = new Map<string, EntryInfo>()
  const names = inspectZip(bytes, metadata)
  // Global checkCRC32 would inflate every file before we could enforce limits.
  // Read each entry with a bounded stream and verify its CRC32 ourselves.
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false })
  const read = async (name: string) =>
    JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await readCheckedEntry(zip, name, metadata.get(name)!),
      ),
    ) as unknown
  const manifest = manifestSchema.parse(await read("manifest.json"))
  if (manifest.version < 3 && [...names].some((name) => name.endsWith(".mp3")))
    throw new Error("ZIP v1/v2 chỉ hỗ trợ WAV.")
  const events =
    manifest.version >= 4
      ? z
          .array(manifest.version === 4 ? reviewEventV4Schema : reviewEventSchema)
          .max(MAX_REVIEW_EVENTS)
          .parse(await read("reviews.json"))
      : []
  if (
    (manifest.version < 4 && names.has("reviews.json")) ||
    (manifest.version >= 4 &&
      (("reviewCount" in manifest ? manifest.reviewCount : -1) !== events.length ||
        new Set(events.map((event) => event.id)).size !== events.length))
  )
    throw new Error("Nhật ký bị trùng hoặc sai phiên bản.")
  const cards = z
    .array(cardSchema)
    .max(MAX_CARDS)
    .parse(await read("vocabulary.json"))
  const progress = z
    .array(progressSchema)
    .max(MAX_CARDS)
    .parse(await read("progress.json"))
  const ids = new Set(cards.map((c) => c.id))
  if (
    ids.size !== cards.length ||
    manifest.cardCount !== cards.length ||
    new Set(progress.map((p) => p.cardId)).size !== progress.length ||
    progress.some((p) => !ids.has(p.cardId))
  )
    throw new Error("Dữ liệu hoặc tiến độ bị trùng/sai ID.")
  const audioIds = new Set(cards.flatMap((c) => [c.audio.word, c.audio.example]))
  if (names.size !== audioIds.size + (manifest.version >= 4 ? 4 : 3))
    throw new Error("Số file audio không khớp dữ liệu.")
  for (const card of cards)
    card.acceptedAnswers = validateLearningContent(learningContentFromCard(card)).acceptedAnswers
  const audio: VocabularyBundle["audio"] = []
  for (const id of audioIds) {
    const name = names.has(`audio/${id}.mp3`) ? `audio/${id}.mp3` : `audio/${id}.wav`
    const entry = zip.file(name)
    if (!entry) throw new Error("Bộ từ thiếu audio.")
    const data = await readCheckedEntry(zip, name, metadata.get(name)!)
    const mp3 = name.endsWith(".mp3")
    if (!(mp3 ? isMp3(data) : isWav(data)) || (await sha256(data)) !== id)
      throw new Error("Audio bị hỏng hoặc không khớp mã kiểm tra.")
    audio.push({ id, bytes: data, contentType: mp3 ? "audio/mpeg" : "audio/wav" })
  }
  return {
    cards,
    progress,
    audio,
    ...(events.length ? { events } : {}),
    ...("notebook" in manifest && manifest.notebook ? { notebook: manifest.notebook } : {}),
  }
}
