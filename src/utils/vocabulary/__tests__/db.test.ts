import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  vocabularyDB,
  importLibrary,
  exportLibrary,
  loadLibrary,
  reviewCard,
  deleteVocabularyCard,
} from "../db"
import { scheduleReview } from "../schema"
import { vocabularyFixture } from "./fixtures"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})

beforeEach(async () => {
  await vocabularyDB.cards.clear()
  await vocabularyDB.audio.clear()
  await vocabularyDB.progress.clear()
})
describe("vocabulary persistence", () => {
  it("cannot create orphan progress after a word was deleted in another window", async () => {
    const bundle = await vocabularyFixture()
    await importLibrary(bundle)
    await deleteVocabularyCard(bundle.cards[0]!.id)
    await expect(reviewCard(bundle.cards[0]!.id, "flash", "good")).rejects.toThrow("đã được xóa")
    expect(await vocabularyDB.progress.count()).toBe(0)
  })
  it("merges cards without duplicating or resetting newer progress, including concurrent review modes", async () => {
    const bundle = await vocabularyFixture()
    await importLibrary(bundle)
    await reviewCard(bundle.cards[0]!.id, "flash", "easy")
    bundle.progress[0]!.type = scheduleReview(bundle.progress[0]!.type, "good", 3000)
    await importLibrary(bundle)
    const stored = await exportLibrary()
    expect(stored.cards).toHaveLength(1)
    expect(stored.progress[0]!.flash.reviews).toBe(1)
    expect(stored.progress[0]!.type.updatedAt).toBe(3000)
    expect((await loadLibrary()).cards[0]!.meaning).toBe("đảo ngược")
  })
  it("rolls back all new content and assets if a transactional write fails", async () => {
    const initial = await vocabularyFixture()
    await importLibrary(initial)
    const next = await vocabularyFixture("increase")
    // Duplicate primary key in an audio object violates the store key, after a
    // preceding valid write; the entire transaction must roll back.
    const bad = {
      ...next,
      audio: [next.audio[0]!, { ...next.audio[1]!, id: undefined }],
    } as unknown as typeof next
    await expect(importLibrary(bad)).rejects.toThrow(/Data|key/i)
    expect((await exportLibrary()).cards.map((c) => c.word)).toEqual(["reverse"])
    expect((await exportLibrary()).audio).toHaveLength(2)
  })
  it("deletes progress with a word and keeps audio still referenced by another card", async () => {
    const first = await vocabularyFixture(),
      second = await vocabularyFixture("increase")
    await importLibrary(first)
    await importLibrary(second)
    await deleteVocabularyCard(first.cards[0]!.id)
    const result = await exportLibrary()
    expect(result.cards.map((c) => c.word)).toEqual(["increase"])
    expect(result.progress.map((p) => p.cardId)).toEqual([second.cards[0]!.id])
    expect(result.audio).toHaveLength(2)
  })
})
