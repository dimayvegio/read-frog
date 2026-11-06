import JSZip from "jszip"
import { beforeEach, describe, it, expect, vi } from "vitest"
import { createVocabularyZip, readVocabularyZip } from "../archive"
import {
  vocabularyDB,
  importLibrary,
  exportLibrary,
  recordReviewAnswer,
  reviewCard,
  loadReviewEvents,
  createNotebook,
  moveVocabularyCard,
  deleteVocabularyCard,
  clearReviewEvents,
} from "../db"
import { createReviewReport, summarizeReviewEvents } from "../review-log"
import { vocabularyFixture, legacyVocabularyZip } from "./fixtures"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
const attempt = () => ({
  id: crypto.randomUUID(),
  sessionId: "feefc361-71ca-4f83-b302-7f09bc53a776",
  elapsedMs: 1234,
})
async function book() {
  await importLibrary(await vocabularyFixture())
  const data = await exportLibrary()
  return { bookId: data.notebook!.id, cardId: data.cards[0]!.id }
}
beforeEach(async () => {
  for (const table of vocabularyDB.tables) await table.clear()
})
describe("review logs and learning reports", () => {
  it("records the first wrong check immediately even when the learner never grades it", async () => {
    const { bookId, cardId } = await book(),
      key = attempt()
    await recordReviewAnswer(cardId, "type", "incorrect", "revert", key, bookId)
    await recordReviewAnswer(cardId, "type", "correct", "reverse", key, bookId)
    const rows = await loadReviewEvents(bookId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      result: "incorrect",
      answer: "revert",
      grade: null,
      elapsedMs: 1234,
    })
    expect((await exportLibrary(bookId)).progress[0]!.type.reviews).toBe(0)
    expect(summarizeReviewEvents(rows)).toMatchObject({ attempts: 1, incorrect: 1, correct: 0 })
  })
  it("grades an attempt and schedule atomically exactly once, keeping the original checked answer", async () => {
    const { bookId, cardId } = await book(),
      key = attempt()
    await recordReviewAnswer(cardId, "type", "incorrect", "revert", key, bookId)
    await expect(reviewCard(cardId, "type", "easy", bookId, key)).rejects.toThrow("Chưa nhớ")
    await reviewCard(cardId, "type", "again", bookId, key)
    await reviewCard(cardId, "type", "again", bookId, key)
    expect((await exportLibrary(bookId)).progress[0]!.type.reviews).toBe(1)
    expect(await loadReviewEvents(bookId)).toHaveLength(1)
    expect((await loadReviewEvents(bookId))[0]).toMatchObject({
      result: "incorrect",
      grade: "again",
      answer: "revert",
    })
  })
  it("separates objectively checked answers, revealed answers and self-ratings", async () => {
    const { bookId, cardId } = await book()
    await reviewCard(cardId, "flash", "easy", bookId, attempt())
    await recordReviewAnswer(cardId, "choice", "correct", "đảo ngược", attempt(), bookId)
    await recordReviewAnswer(cardId, "type", "incorrect", "revert", attempt(), bookId)
    await recordReviewAnswer(cardId, "type", "revealed", "", attempt(), bookId)
    const report = createReviewReport(
      { id: bookId, name: "Sổ của tôi" },
      await loadReviewEvents(bookId),
    )
    expect(report.summary).toMatchObject({
      attempts: 4,
      uniqueWords: 1,
      correct: 1,
      incorrect: 1,
      revealed: 1,
      selfRated: 1,
      accuracyPercent: 50,
      sessions: 1,
    })
    expect(report.byMode.flash!.accuracyPercent).toBeNull()
    expect(report.byMode.choice!.accuracyPercent).toBe(100)
    expect(report.summary.unassistedRecallPercent).toBe(33.3)
    expect(report.words[0]).toMatchObject({ word: "reverse", incorrect: 1, revealed: 1 })
    expect(JSON.stringify(report)).not.toMatch(/apiKey|sourceUrl/)
  })
  it("round trips compressed ZIP v4 and merges duplicate IDs and newer grades without erasing history with old ZIP", async () => {
    const { bookId, cardId } = await book(),
      key = attempt()
    await recordReviewAnswer(cardId, "choice", "correct", "đảo ngược", key, bookId)
    const old = await readVocabularyZip(await createVocabularyZip(await exportLibrary(bookId)))
    await reviewCard(cardId, "choice", "good", bookId, key)
    const latest = await readVocabularyZip(await createVocabularyZip(await exportLibrary(bookId)))
    for (const table of vocabularyDB.tables) await table.clear()
    await importLibrary(latest)
    await importLibrary(latest)
    await importLibrary(old)
    expect(await loadReviewEvents(bookId)).toHaveLength(1)
    expect((await loadReviewEvents(bookId))[0]!.grade).toBe("good")
    expect((await exportLibrary(bookId)).progress[0]!.choice.reviews).toBe(1)
    const conflict = structuredClone(latest)
    conflict.events![0]!.answer = "conflicting answer"
    await expect(importLibrary(conflict)).rejects.toThrow("trùng ID")
    expect((await loadReviewEvents(bookId))[0]!.answer).toBe("đảo ngược")
  })
  it("keeps v1/v2/v3 imports from inventing or deleting checked-answer history", async () => {
    const { bookId, cardId } = await book()
    await recordReviewAnswer(cardId, "type", "correct", "reverse", attempt(), bookId)
    for (const version of [1, 2, 3]) {
      const bundle = await vocabularyFixture()
      if (version !== 1) bundle.notebook = (await exportLibrary(bookId)).notebook
      const zip = await JSZip.loadAsync(await legacyVocabularyZip(bundle)),
        manifest = JSON.parse(await zip.file("manifest.json")!.async("string"))
      manifest.version = version
      zip.file("manifest.json", JSON.stringify(manifest))
      await importLibrary(
        await readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
        bookId,
      )
    }
    expect(await loadReviewEvents(bookId)).toHaveLength(1)
  })
  it("moves history with a word and retains historical snapshots after the word is deleted", async () => {
    const { bookId, cardId } = await book(),
      target = await createNotebook("Sổ khác")
    await recordReviewAnswer(cardId, "type", "correct", "reverse", attempt(), bookId)
    await moveVocabularyCard(cardId, bookId, target.id)
    expect(await loadReviewEvents(bookId)).toHaveLength(0)
    expect(await loadReviewEvents(target.id)).toHaveLength(1)
    await deleteVocabularyCard(cardId, target.id)
    const deleted = await readVocabularyZip(
      await createVocabularyZip(await exportLibrary(target.id)),
    )
    expect(deleted.cards).toHaveLength(0)
    expect(deleted.events).toHaveLength(1)
    expect(deleted.events![0]!.word).toBe("reverse")
  })
  it("clears logs without resetting schedules or words and rolls back a full-log grade", async () => {
    const { bookId, cardId } = await book()
    await reviewCard(cardId, "flash", "good", bookId, attempt())
    await vocabularyDB.meta.put({
      key: `logBudget:${bookId}`,
      value: JSON.stringify({ count: 20000, bytes: 1000 }),
    })
    await expect(reviewCard(cardId, "flash", "good", bookId, attempt())).rejects.toThrow(
      "Nhật ký đã đầy",
    )
    expect((await exportLibrary(bookId)).progress[0]!.flash.reviews).toBe(1)
    await clearReviewEvents(bookId)
    expect(await loadReviewEvents(bookId)).toHaveLength(0)
    expect((await exportLibrary(bookId)).cards).toHaveLength(1)
    expect((await exportLibrary(bookId)).progress[0]!.flash.reviews).toBe(1)
    await reviewCard(cardId, "flash", "good", bookId, attempt())
    expect(await loadReviewEvents(bookId)).toHaveLength(1)
  })
  it("rejects duplicate, malformed or count-mismatched logs before import", async () => {
    const { bookId, cardId } = await book()
    await recordReviewAnswer(cardId, "type", "correct", "reverse", attempt(), bookId)
    const zip = await JSZip.loadAsync(await createVocabularyZip(await exportLibrary(bookId))),
      events = JSON.parse(await zip.file("reviews.json")!.async("string"))
    zip.file("reviews.json", JSON.stringify([events[0], events[0]]))
    await expect(
      readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow("Nhật ký")
    zip.file("reviews.json", JSON.stringify([{ ...events[0], apiKey: "never-import" }]))
    await expect(
      readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow(/Unrecognized/)
    zip.file("reviews.json", JSON.stringify([{ ...events[0], result: "self", grade: null }]))
    await expect(
      readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow(/Invalid/)
  })
  it("filters by period and aggregates days in the report timezone", async () => {
    const { bookId, cardId } = await book()
    await recordReviewAnswer(cardId, "type", "correct", "reverse", attempt(), bookId)
    const event = (await loadReviewEvents(bookId))[0]!,
      now = Date.UTC(2026, 10, 6, 20)
    const report = createReviewReport(
      { id: bookId, name: "Sổ 1" },
      [
        { ...event, occurredAt: now - 3600000 },
        { ...event, id: crypto.randomUUID(), occurredAt: now - 10 * 86400000 },
      ],
      { now, days: 7, timeZone: "Asia/Ho_Chi_Minh" },
    )
    expect(report.summary.attempts).toBe(1)
    expect(report.daily[0]!.day).toBe("2026-11-07")
    expect(report.period.firstRecordedAt).toBe(now - 10 * 86400000)
    expect(
      summarizeReviewEvents([
        { ...event, elapsedMs: 100 },
        { ...event, elapsedMs: 900 },
      ]).medianResponseMs,
    ).toBe(500)
  })
})
