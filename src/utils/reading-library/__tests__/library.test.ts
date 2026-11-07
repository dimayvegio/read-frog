import { Dexie } from "dexie"
import { indexedDB, IDBKeyRange } from "fake-indexeddb"
import { afterEach, describe, it, expect } from "vitest"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import {
  ReadingLibraryDatabase,
  saveReadingPassage,
  libraryEpoch,
  createReadingFolder,
  deleteReadingPassage,
  importReadingBundle,
} from "../db"
import { bundleFixture, passageFixture } from "./fixtures"
let db: ReadingLibraryDatabase
Dexie.dependencies.indexedDB = indexedDB
Dexie.dependencies.IDBKeyRange = IDBKeyRange
afterEach(async () => {
  if (db) {
    db.close()
    await db.delete()
  }
})
const open = () => (db = new ReadingLibraryDatabase(`reading-${getRandomUUID()}`))
describe("local passage library transactions", () => {
  it("keeps folders, metadata, complete text and compressed audio across reopen", async () => {
    open()
    const folder = await createReadingFolder("Công việc", db),
      bundle = await bundleFixture(),
      passage = { ...bundle.passages[0]!, folderId: folder.id, favorite: true }
    const saved = await saveReadingPassage(passage, bundle.assets, null, 0, db)
    const name = db.name
    db.close()
    db = new ReadingLibraryDatabase(name)
    expect(await db.passages.get(saved.id)).toEqual(saved)
    expect((await db.assets.toArray()).map((item) => item.id).sort()).toEqual(
      bundle.assets.map((item) => item.id).sort(),
    )
    await expect(createReadingFolder("công việc", db)).rejects.toThrow(/đã có/)
  })
  it("fences stale edits/deletes and only collects audio no passage still uses", async () => {
    open()
    const bundle = await bundleFixture(),
      one = await saveReadingPassage(bundle.passages[0]!, bundle.assets, null, 0, db)
    const two = await saveReadingPassage({ ...one, id: getRandomUUID() }, [], null, 0, db)
    const updated = await saveReadingPassage({ ...one, title: "Đổi tên" }, [], one.revision, 0, db)
    await expect(saveReadingPassage(one, [], one.revision, 0, db)).rejects.toThrow(/cửa sổ khác/)
    await deleteReadingPassage(one.id, db)
    expect(await db.assets.count()).toBe(2)
    await expect(
      saveReadingPassage(updated, bundle.assets, updated.revision, 0, db),
    ).rejects.toThrow(/Thư viện đã thay đổi/)
    await deleteReadingPassage(two.id, db)
    expect(await db.assets.count()).toBe(0)
  })
  it("imports stable IDs once without overwriting local edits and rolls back an oversized library", async () => {
    open()
    const bundle = await bundleFixture()
    expect(await importReadingBundle(bundle, db)).toEqual({ added: 1, skipped: 0 })
    const row = (await db.passages.toArray())[0]!,
      epoch = await libraryEpoch(db)
    await saveReadingPassage({ ...row, title: "Local edit" }, [], row.revision, epoch, db)
    expect(await importReadingBundle(bundle, db)).toEqual({ added: 0, skipped: 1 })
    expect((await db.passages.get(row.id))?.title).toBe("Local edit")
    const many = Array.from({ length: 100 }, () => passageFixture())
    await expect(
      importReadingBundle({ passages: many, folders: [], assets: [] }, db),
    ).rejects.toThrow(/đầy/)
    expect(await db.passages.count()).toBe(1)
  })
})
