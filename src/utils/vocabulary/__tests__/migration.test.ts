import { Dexie } from "dexie"
import { describe, it, expect, vi } from "vitest"
import { VocabularyDatabase } from "../db"
import { migrateVocabularyV1ToV2 } from "../migrations/v1-to-v2"
import { scheduleReview } from "../schema"
import { vocabularyFixture } from "./fixtures"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})

describe("frozen vocabulary v1 -> v2", () => {
  it("upgrades real v1 stores atomically, keeping words, WAV and all three review histories", async () => {
    const name = `vocabulary-migration-${crypto.randomUUID()}`,
      old = new Dexie(name)
    old
      .version(1)
      .stores({ cards: "&id, captureKey, updatedAt", audio: "&id", progress: "&cardId" })
    const bundle = await vocabularyFixture()
    bundle.progress[0]!.flash = scheduleReview(bundle.progress[0]!.flash, "easy", 2000)
    bundle.progress[0]!.choice = scheduleReview(bundle.progress[0]!.choice, "hard", 3000)
    bundle.progress[0]!.type = scheduleReview(bundle.progress[0]!.type, "again", 4000)
    await old.table("cards").bulkPut(bundle.cards)
    await old.table("audio").bulkPut(bundle.audio)
    await old.table("progress").bulkPut(bundle.progress)
    old.close()
    const db = new VocabularyDatabase(name)
    try {
      await db.open()
      expect(db.verno).toBe(2)
      const notebooks = await db.notebooks.toArray()
      expect(notebooks).toHaveLength(1)
      expect(notebooks[0]!.name).toBe("Sổ 1")
      const id = notebooks[0]!.id
      expect(await db.notebookCards.get([id, bundle.cards[0]!.id])).toEqual({
        ...bundle.cards[0],
        notebookId: id,
      })
      expect(await db.notebookProgress.get([id, bundle.cards[0]!.id])).toEqual({
        ...bundle.progress[0],
        notebookId: id,
      })
      expect(await db.audio.toArray()).toEqual(bundle.audio)
      expect(await db.cards.toArray()).toEqual(bundle.cards)
      await db.transaction("rw", db.tables, () => migrateVocabularyV1ToV2(Dexie.currentTransaction))
      expect(await db.notebooks.count()).toBe(1)
      db.close()
      await db.open()
      expect(await db.notebookCards.count()).toBe(1)
    } finally {
      await db.delete()
    }
  })
  it("does not create a dummy notebook when an unused v1 database was empty", async () => {
    const name = `vocabulary-empty-${crypto.randomUUID()}`,
      old = new Dexie(name)
    old
      .version(1)
      .stores({ cards: "&id, captureKey, updatedAt", audio: "&id", progress: "&cardId" })
    await old.open()
    old.close()
    const db = new VocabularyDatabase(name)
    try {
      await db.open()
      expect(await db.notebooks.count()).toBe(0)
      expect(await db.audio.count()).toBe(0)
    } finally {
      await db.delete()
    }
  })
  it("gives matching migrated notebook IDs to legacy replicas while keeping independent libraries distinct", async () => {
    const original = await vocabularyFixture(),
      newer = await vocabularyFixture("increase")
    newer.cards[0]!.createdAt = 2000
    const ids: string[] = []
    for (const [index, cards] of [
      [original.cards[0]!],
      [original.cards[0]!, newer.cards[0]!],
      [{ ...original.cards[0]!, createdAt: 1001 }],
    ].entries()) {
      const name = `replica-${index}-${crypto.randomUUID()}`,
        old = new Dexie(name)
      old
        .version(1)
        .stores({ cards: "&id, captureKey, updatedAt", audio: "&id", progress: "&cardId" })
      await old.table("cards").bulkPut(cards)
      old.close()
      const upgraded = new VocabularyDatabase(name)
      try {
        await upgraded.open()
        ids.push((await upgraded.notebooks.toArray())[0]!.id)
      } finally {
        await upgraded.delete()
      }
    }
    expect(ids[0]).toBe(ids[1])
    expect(ids[2]).not.toBe(ids[0])
  })
})
