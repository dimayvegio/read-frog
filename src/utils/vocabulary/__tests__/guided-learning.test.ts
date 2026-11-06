import JSZip from "jszip"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createVocabularyZip, readVocabularyZip } from "../archive"
import {
  vocabularyDB,
  importLibrary,
  exportLibrary,
  loadReviewEvents,
  reviewCard,
  clearVocabularyLibrary,
} from "../db"
import {
  createLearningRun,
  currentLearningTask,
  advanceLearningRun,
  clozeFor,
  spellingDiff,
} from "../guided-learning"
import { assessVocabulary } from "../learning-assessment"
import {
  startLearningRun,
  loadLearningRun,
  changeLearningRun,
  submitLearningAnswer,
} from "../learning-run-db"
import { createReviewReport, summarizeReviewEvents, reviewEventV4Schema } from "../review-log"
import { reviewReportMarkdown } from "../review-report-markdown"
import { emptyProgress, type VocabularyBundle } from "../schema"
import { vocabularyFixture } from "./fixtures"

await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
beforeEach(async () => {
  for (const table of vocabularyDB.tables) await table.clear()
})
const session = "11111111-1111-4111-8111-111111111111"
async function fixture(count = 5): Promise<VocabularyBundle> {
  const base = await vocabularyFixture()
  const cards = Array.from({ length: count }, (_, i) => ({
    ...base.cards[0]!,
    id: (i + 1).toString(16).padStart(64, "0"),
    captureKey: (i + 2001).toString(16).padStart(64, "0"),
    word: `term${i}`,
    acceptedAnswers: [`term${i}`],
    meaning: `nghĩa của từ ${i}`,
    example: { sentence: `They use term${i} every day.`, translation: "Họ dùng từ này hằng ngày." },
  }))
  return { ...base, cards, progress: cards.map((c) => emptyProgress(c.id)) }
}
async function start(mode: "recall" | "dictation" | "cloze" | "today" = "recall", count = 5) {
  await importLibrary(await fixture(count))
  const data = await exportLibrary(),
    bookId = data.notebook!.id
  const run = await startLearningRun(bookId, data.cards, [], data.progress, mode)
  return { data, bookId, run }
}
describe("guided learning and honest evidence", () => {
  it("limits a 1,000-word notebook to five new words and three interleaved rounds", async () => {
    const data = await fixture(1000)
    const run = createLearningRun(crypto.randomUUID(), data.cards, [], data.progress, "today")
    expect(run.queue).toHaveLength(15)
    expect(new Set(run.queue.map((t) => t.cardId)).size).toBe(5)
    expect(run.phase).toBe("study")
    expect(run.queue.map((t) => t.kind)).toEqual([
      ...Array(5).fill("recall"),
      ...Array(5).fill("dictation"),
      ...Array(5).fill("cloze"),
    ])
    expect(run.queue[0]!.cardId).toBe(run.queue[5]!.cardId)
  })
  it("blanks whole accepted words, supports short words and never fabricates an inflection", async () => {
    const card = (await vocabularyFixture("a")).cards[0]!
    card.example.sentence = "A cat sits there."
    card.context = ""
    expect(clozeFor(card)).toEqual({ prompt: "_____ cat sits there.", expected: "A" })
    card.word = "run"
    card.acceptedAnswers = ["run"]
    card.example.sentence = "He is running."
    expect(clozeFor(card)).toBeNull()
    card.example.sentence = "We run and run."
    expect(clozeFor(card)).toBeNull()
    card.acceptedAnswers.push("running")
    card.example.sentence = "He is running."
    expect(clozeFor(card)?.expected).toBe("running")
  })
  it("highlights Unicode spelling differences without splitting Vietnamese combining accents", () => {
    const diff = spellingDiff("tiếng", "tie\u0302\u0301ng")
    expect(diff.target.some((c) => c.changed)).toBe(false)
    expect(spellingDiff("reverse", "revert").target.some((c) => c.changed)).toBe(true)
  })
  it("keeps the first miss on reload and mandatory correction separate from recall and SRS", async () => {
    const { run, bookId, data } = await start()
    const task = currentLearningTask(run)!
    const first = await submitLearningAnswer(bookId, run.id, "wrong", session, 1200)
    expect(first.run.phase).toBe("correction")
    expect((await loadLearningRun(bookId))?.feedback?.answer).toBe("wrong")
    await submitLearningAnswer(bookId, run.id, task.expected, session, 600)
    await submitLearningAnswer(bookId, run.id, task.expected, session, 600)
    const events = await loadReviewEvents(bookId)
    expect(events).toHaveLength(2)
    expect(summarizeReviewEvents(events)).toMatchObject({
      correct: 0,
      incorrect: 1,
      correctionAttempts: 1,
    })
    expect(assessVocabulary(events, data.cards).needsReview[0]!.evidence.consecutiveCorrect).toBe(0)
    expect((await exportLibrary(bookId)).progress[0]!.type.reviews).toBe(1)
    const next = await changeLearningRun(bookId, run.id, "next")
    expect(next.queue[4]!.cardId).toBe(task.cardId)
    expect(next.queue[4]!.id).not.toBe(task.id)
    expect(next.hint).toBe("none")
  })
  it.each(["hint", "paste"] as const)(
    "marks %s assistance before scoring and exports it in ZIP v5",
    async (action) => {
      const { run, bookId, data } = await start("dictation")
      await changeLearningRun(bookId, run.id, action)
      await changeLearningRun(bookId, run.id, "audio")
      const result = await submitLearningAnswer(
        bookId,
        run.id,
        run.queue[0]!.expected,
        session,
        1000,
      )
      expect(result.event?.exercise).toMatchObject({
        kind: "dictation",
        assisted: true,
        audioReplays: 1,
      })
      expect(summarizeReviewEvents([result.event!])).toMatchObject({
        correct: 0,
        assistedAttempts: 1,
        unassistedRecallPercent: 0,
      })
      expect(assessVocabulary([result.event!], data.cards).needsReview).toHaveLength(1)
      expect(reviewEventV4Schema.safeParse(result.event).success).toBe(false)
      const zipped = await createVocabularyZip(await exportLibrary(bookId))
      const decoded = await readVocabularyZip(zipped)
      expect(decoded.events?.[0]?.exercise).toEqual(result.event?.exercise)
      const zip = await JSZip.loadAsync(zipped),
        manifest = JSON.parse(await zip.file("manifest.json")!.async("string"))
      expect(manifest.version).toBe(5)
      manifest.version = 4
      zip.file("manifest.json", JSON.stringify(manifest))
      await expect(
        readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
      ).rejects.toThrow(/./)
    },
  )
  it("updates SRS once per word per run and lowers it after a later miss", async () => {
    const { run, bookId } = await start("recall", 1)
    await submitLearningAnswer(bookId, run.id, "term0", session, 1000)
    await changeLearningRun(bookId, run.id, "next")
    await submitLearningAnswer(bookId, run.id, "term0", session, 1000)
    await changeLearningRun(bookId, run.id, "next")
    await submitLearningAnswer(bookId, run.id, "wrong", session, 1000)
    const progress = (await exportLibrary(bookId)).progress[0]!.type
    expect(progress.reviews).toBe(1)
    expect(progress.intervalDays).toBeCloseTo(1 / 1440)
    expect(progress.lapses).toBe(1)
  })
  it("preserves a concurrent regular review and rejects a stale step from another window", async () => {
    const { run, bookId } = await start("recall", 1),
      task = run.queue[0]!
    await submitLearningAnswer(bookId, run.id, "term0", session, 1000)
    await reviewCard(task.cardId, "type", "easy", bookId)
    await changeLearningRun(bookId, run.id, "next", task.id)
    await expect(
      submitLearningAnswer(bookId, run.id, "wrong", session, 1000, false, task.id),
    ).rejects.toThrow("Bước học")
    await submitLearningAnswer(bookId, run.id, "wrong", session, 1000)
    const progress = (await exportLibrary(bookId)).progress[0]!.type
    expect(progress.reviews).toBe(2)
    expect(progress.intervalDays).toBeCloseTo(1 / 1440)
  })
  it("rolls back the first answer, schedule and run together when log capacity is exhausted", async () => {
    const { run, bookId } = await start()
    await vocabularyDB.meta.put({
      key: `logBudget:${bookId}`,
      value: JSON.stringify({ count: 20000, bytes: 2 }),
    })
    await expect(submitLearningAnswer(bookId, run.id, "term0", session, 1000)).rejects.toThrow(
      "đã đầy",
    )
    expect(await loadReviewEvents(bookId)).toHaveLength(0)
    expect((await loadLearningRun(bookId))?.phase).toBe("question")
    expect((await exportLibrary(bookId)).progress[0]!.type.reviews).toBe(0)
  })
  it("caps retries and clears a paused run together with its notebook", async () => {
    const { run, bookId, data } = await start("recall", 1)
    let advanced = run
    for (let i = 0; i < 5; i++) {
      advanced.feedback = { result: "incorrect", answer: "wrong", eventId: crypto.randomUUID() }
      advanced = advanceLearningRun(advanced, data.cards)
    }
    expect(advanced.queue).toHaveLength(5)
    expect(advanced.phase).toBe("done")
    await clearVocabularyLibrary(bookId)
    expect(await loadLearningRun(bookId)).toBeNull()
  })
  it("keeps a 1,000-word / 10,000-answer ChatGPT report compact with per-word progress", async () => {
    const data = await fixture(1000),
      now = Date.now()
    const events = data.cards.flatMap((card, i) =>
      Array.from({ length: 10 }, (_, j) => ({
        id: crypto.randomUUID(),
        sessionId: session,
        cardId: card.id,
        occurredAt: now - 20000 + i * 10 + j,
        mode: "type" as const,
        result: j % 2 ? ("incorrect" as const) : ("correct" as const),
        word: card.word,
        meaning: card.meaning,
        language: card.language,
        answer: j % 2 ? "wrong" : card.word,
        elapsedMs: 1000,
        grade: null,
        gradedAt: 0,
      })),
    )
    const started = performance.now()
    const report = createReviewReport(null, events, { cards: data.cards }),
      markdown = reviewReportMarkdown(report)
    expect(report.summary).toMatchObject({ uniqueWords: 1000, correct: 5000, incorrect: 5000 })
    expect(report.assessment.needsReview).toHaveLength(1000)
    for (const card of data.cards)
      expect(markdown).toContain(`| ${card.word} (en-US) | N | 5/5/0 |`)
    expect(new TextEncoder().encode(markdown).length).toBeLessThan(110_000)
    expect(markdown).not.toContain('"events"')
    expect(performance.now() - started).toBeLessThan(5000)
  })
})
