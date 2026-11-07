import type { PronunciationAttempt } from "../schema"
import { beforeEach, expect, it, vi } from "vitest"
import { pronunciationDB, pronunciationEpoch, saveAttempt, clearPronunciationHistory } from "../db"
import { practiceFeedback } from "./fixtures"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
const attempt = (id: string): PronunciationAttempt => ({
  id,
  evaluationKey: id,
  referenceKey: "ref",
  text: "Read it again.",
  context: "",
  audioHash: "hash",
  audioMs: 1000,
  createdAt: Date.now(),
  rubric: "en-us-v1",
  model: "gpt-audio-1.5",
  feedback: practiceFeedback(),
  score: 7.5,
})
beforeEach(async () => {
  await clearPronunciationHistory()
})
it("deduplicates stable evaluation IDs without audio storage and survives reopening", async () => {
  const epoch = await pronunciationEpoch()
  const first = await saveAttempt(attempt("one"), epoch)
  const second = await saveAttempt({ ...attempt("two"), evaluationKey: "one" }, epoch)
  expect(second.attempt.id).toBe(first.attempt.id)
  expect(await pronunciationDB.attempts.count()).toBe(1)
  pronunciationDB.close()
  await pronunciationDB.open()
  expect((await pronunciationDB.attempts.toArray())[0]!.feedback.nextPractice).toEqual(
    first.attempt.feedback.nextPractice,
  )
})
it("never replaces history when 1,000-attempt budget is reached", async () => {
  await pronunciationDB.attempts.bulkAdd(
    Array.from({ length: 1000 }, (_, i) => attempt(`prior-${i}`)),
  )
  const saved = await saveAttempt(attempt("new"), await pronunciationEpoch())
  expect(saved.saved).toBe(false)
  expect(await pronunciationDB.attempts.count()).toBe(1000)
  expect(await pronunciationDB.attempts.get("prior-0")).toBeDefined()
  expect(await pronunciationDB.attempts.get("new")).toBeUndefined()
})
it("fences stale epochs and aborted saves so neither can resurrect cleared attempts", async () => {
  const epoch = await pronunciationEpoch()
  await clearPronunciationHistory()
  await expect(saveAttempt(attempt("late"), epoch)).rejects.toThrow(/xóa/)
  const controller = new AbortController()
  controller.abort()
  await expect(
    saveAttempt(attempt("abort"), await pronunciationEpoch(), controller.signal),
  ).rejects.toThrow(/abort/i)
  expect(await pronunciationDB.attempts.count()).toBe(0)
})
