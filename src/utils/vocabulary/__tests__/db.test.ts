import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  vocabularyDB,
  importLibrary,
  exportLibrary,
  loadLibrary,
  reviewCard,
  deleteVocabularyCard,
  createNotebook,
  renameNotebook,
  setActiveNotebook,
  moveVocabularyCard,
  saveGeneratedCard,
} from "../db"
import { scheduleReview } from "../schema"
import { vocabularyFixture } from "./fixtures"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})

beforeEach(async () => {
  for (const table of vocabularyDB.tables) await table.clear()
})
describe("vocabulary persistence", () => {
  it("cannot create orphan progress after a word was deleted in another window", async () => {
    const bundle = await vocabularyFixture()
    await importLibrary(bundle)
    await deleteVocabularyCard(bundle.cards[0]!.id)
    await expect(reviewCard(bundle.cards[0]!.id, "flash", "good")).rejects.toThrow("đã được xóa")
    expect(await vocabularyDB.notebookProgress.count()).toBe(0)
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
  it("creates named notebooks without deleting existing words and remembers the active notebook", async () => {
    const bundle = await vocabularyFixture()
    await importLibrary(bundle)
    const first = (await loadLibrary()).notebook!
    const second = await createNotebook("Sổ 2")
    expect((await loadLibrary()).notebook?.id).toBe(second.id)
    expect((await loadLibrary()).cards).toHaveLength(0)
    expect((await loadLibrary(first.id)).cards).toHaveLength(1)
    await renameNotebook(second.id, "Tiếng Anh công việc")
    await setActiveNotebook(first.id)
    expect((await loadLibrary()).notebook?.name).toBe("Sổ 1")
    await expect(renameNotebook(first.id, "tiếng anh   công việc")).rejects.toThrow("đã có")
  })
  it("keeps independent content and schedules for the same word in two notebooks", async () => {
    const bundle = await vocabularyFixture()
    await importLibrary(bundle)
    const first = (await loadLibrary()).notebook!
    await reviewCard(bundle.cards[0]!.id, "flash", "easy", first.id)
    const second = await createNotebook("Sổ 2")
    await saveGeneratedCard(
      { ...bundle.cards[0]!, context: "Another context." },
      [],
      undefined,
      second.id,
    )
    expect((await exportLibrary(second.id)).progress[0]!.flash.reviews).toBe(0)
    expect((await exportLibrary(first.id)).progress[0]!.flash.reviews).toBe(1)
    expect((await exportLibrary(first.id)).cards[0]!.context).toContain("election")
    expect((await exportLibrary(second.id)).cards[0]!.context).toBe("Another context.")
    await deleteVocabularyCard(bundle.cards[0]!.id, first.id)
    expect((await exportLibrary(second.id)).audio).toHaveLength(2)
  })
  it("imports different ZIP notebooks separately and merges an older copy without resetting progress", async () => {
    const bundle = await vocabularyFixture()
    await importLibrary(bundle)
    const first = (await loadLibrary()).notebook!,
      firstZip = await exportLibrary(first.id)
    await reviewCard(bundle.cards[0]!.id, "type", "good", first.id)
    const second = await createNotebook("Sổ 2")
    await importLibrary(await vocabularyFixture("increase"), second.id)
    await importLibrary(firstZip)
    expect((await loadLibrary()).notebooks).toHaveLength(2)
    expect((await exportLibrary(first.id)).progress[0]!.type.reviews).toBe(1)
    expect((await exportLibrary(second.id)).cards.map((c) => c.word)).toEqual(["increase"])
    expect((await exportLibrary(second.id)).notebook?.name).toBe("Sổ 2")
  })
  it("moves a word with its progress and audio without affecting other words", async () => {
    const bundle = await vocabularyFixture()
    await importLibrary(bundle)
    await importLibrary(await vocabularyFixture("increase"))
    const first = (await loadLibrary()).notebook!,
      second = await createNotebook("Sổ 2")
    await reviewCard(bundle.cards[0]!.id, "choice", "good", first.id)
    await moveVocabularyCard(bundle.cards[0]!.id, first.id, second.id)
    expect((await exportLibrary(first.id)).cards.map((c) => c.word)).toEqual(["increase"])
    expect((await exportLibrary(second.id)).cards.map((c) => c.word)).toEqual(["reverse"])
    expect((await exportLibrary(second.id)).progress[0]!.choice.reviews).toBe(1)
    expect((await exportLibrary(second.id)).audio).toHaveLength(2)
  })
})
