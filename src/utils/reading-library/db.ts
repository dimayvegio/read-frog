import { Dexie, type Table } from "dexie"
import { sha256 } from "js-sha256"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { isMp3 } from "@/utils/vocabulary/audio"
import {
  MAX_READING_ASSET,
  MAX_READING_LIBRARY,
  MAX_READING_ARCHIVE,
  readingFolderSchema,
  referencedReadingAssets,
  validateReadingPassage,
  type ReadingAsset,
  type ReadingBundle,
  type ReadingFolder,
  type ReadingPassage,
} from "./schema"

export class ReadingLibraryDatabase extends Dexie {
  passages!: Table<ReadingPassage, string>
  folders!: Table<ReadingFolder, string>
  assets!: Table<ReadingAsset, string>
  meta!: Table<{ key: string; value: number }, string>
  constructor(name = "read-frog-reading-library") {
    super(name)
    // Published DB1: independent of config, credentials, vocabulary and PDF history.
    this.version(1).stores({
      passages: "&id, folderId, updatedAt",
      folders: "&id",
      assets: "&id",
      meta: "&key",
    })
  }
}
export const readingLibraryDB = new ReadingLibraryDatabase()
export function readingAssetId(bytes: Uint8Array) {
  return sha256(bytes)
}
export function validateReadingAsset(asset: ReadingAsset) {
  const b = asset.bytes
  if (
    !(b instanceof Uint8Array) ||
    !b.length ||
    b.length > MAX_READING_ASSET ||
    readingAssetId(b) !== asset.id
  )
    throw new Error("Audio không hợp lệ hoặc vượt 8 MiB.")
  const valid =
    asset.type === "audio/mpeg"
      ? isMp3(b)
      : asset.type === "audio/webm"
        ? b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3
        : asset.type === "audio/ogg"
          ? new TextDecoder().decode(b.subarray(0, 4)) === "OggS"
          : asset.type === "audio/mp4" && new TextDecoder().decode(b.subarray(4, 8)) === "ftyp"
  if (!valid) throw new Error("Định dạng audio không hợp lệ.")
  return asset
}
export const libraryEpoch = async (db = readingLibraryDB) =>
  (await db.meta.get("epoch"))?.value ?? 0
async function gcAndBudget(db: ReadingLibraryDatabase) {
  const rows = await db.passages.toArray(),
    used = new Set(rows.flatMap(referencedReadingAssets))
  const keys = await db.assets.toCollection().primaryKeys()
  const stale = keys.filter((id) => !used.has(id))
  await db.assets.bulkDelete(stale)
  let size = new TextEncoder().encode(JSON.stringify(rows)).length
  await db.assets.each((asset) => {
    size += asset.bytes.length
  })
  if (rows.length > 100 || size > MAX_READING_LIBRARY)
    throw new Error("Thư viện đã đầy (100 đoạn / 256 MiB). Hãy xuất ZIP rồi xóa đoạn không cần.")
}
export async function saveReadingPassage(
  input: ReadingPassage,
  assets: ReadingAsset[],
  expectedRevision: number | null,
  epoch: number,
  db = readingLibraryDB,
) {
  const passage = validateReadingPassage(input)
  assets.forEach(validateReadingAsset)
  return db.transaction("rw", db.tables, async () => {
    if ((await libraryEpoch(db)) !== epoch)
      throw new Error("Thư viện đã thay đổi; mở lại đoạn trước khi lưu.")
    const old = await db.passages.get(passage.id)
    if ((old?.revision ?? null) !== expectedRevision)
      throw new Error("Đoạn đã bị sửa hoặc xóa ở cửa sổ khác; mở lại trước khi lưu.")
    if (passage.folderId && !(await db.folders.get(passage.folderId)))
      throw new Error("Thư mục không còn tồn tại.")
    await db.assets.bulkPut(assets)
    let passageBytes = 0
    for (const id of referencedReadingAssets(passage)) {
      const asset = await db.assets.get(id)
      if (!asset) throw new Error("Đoạn thiếu audio.")
      passageBytes += asset.bytes.length
    }
    if (passageBytes > MAX_READING_ARCHIVE)
      throw new Error("Đoạn vượt 64 MiB; chia nhỏ bài hoặc bỏ bớt bản thu trước khi lưu.")
    const value = {
      ...passage,
      createdAt: old?.createdAt ?? passage.createdAt,
      updatedAt: Date.now(),
      revision: (old?.revision ?? 0) + 1,
    }
    await db.passages.put(value)
    await gcAndBudget(db)
    return value
  })
}
export async function createReadingFolder(name: string, db = readingLibraryDB) {
  const value = readingFolderSchema.parse({ id: getRandomUUID(), name })
  return db.transaction("rw", db.folders, async () => {
    const folders = await db.folders.toArray()
    if (
      folders.some((folder) => folder.name.toLocaleLowerCase() === value.name.toLocaleLowerCase())
    )
      throw new Error("Tên thư mục đã có.")
    if (folders.length >= 50) throw new Error("Tối đa 50 thư mục.")
    await db.folders.add(value)
    return value
  })
}
export async function deleteReadingPassage(id: string, db = readingLibraryDB) {
  await db.transaction("rw", db.tables, async () => {
    await db.passages.delete(id)
    await db.meta.put({ key: "epoch", value: (await libraryEpoch(db)) + 1 })
    await gcAndBudget(db)
  })
}
export async function importReadingBundle(bundle: ReadingBundle, db = readingLibraryDB) {
  bundle.passages.forEach(validateReadingPassage)
  bundle.assets.forEach(validateReadingAsset)
  return db.transaction("rw", db.tables, async () => {
    const folderMap = new Map<string, string>(),
      folders = await db.folders.toArray()
    for (const item of bundle.folders) {
      const parsed = readingFolderSchema.parse(item)
      let match = folders.find(
        (folder) => folder.name.toLocaleLowerCase() === parsed.name.toLocaleLowerCase(),
      )
      if (!match) {
        match = { ...parsed, id: getRandomUUID() }
        folders.push(match)
        await db.folders.add(match)
      }
      folderMap.set(item.id, match.id)
    }
    if (folders.length > 50) throw new Error("Nhập ZIP vượt 50 thư mục.")
    await db.assets.bulkPut(bundle.assets)
    let added = 0,
      skipped = 0
    for (const passage of bundle.passages) {
      const old = await db.passages.get(passage.id)
      if (old) {
        skipped++
        continue
      } // Stable IDs: no overwriting local edits or double import.
      const folderId = passage.folderId ? folderMap.get(passage.folderId) : null
      if (passage.folderId && !folderId) throw new Error("ZIP thiếu thư mục.")
      for (const id of referencedReadingAssets(passage))
        if (!(await db.assets.get(id))) throw new Error("ZIP thiếu audio.")
      await db.passages.add({ ...passage, folderId: folderId ?? null, revision: 1 })
      added++
    }
    await db.meta.put({ key: "epoch", value: (await libraryEpoch(db)) + 1 })
    await gcAndBudget(db)
    return { added, skipped }
  })
}
