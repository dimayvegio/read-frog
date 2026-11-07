import { expect, it } from "vitest"
import { estimateUsage, type UsageEntry } from "@/utils/usage/schema"
import { encodePracticeWav, validatePracticeWav, wavBase64 } from "../audio"
import { pronunciationReport } from "../report"
import {
  criterionKeys,
  overallScore,
  referenceKey,
  referenceSchema,
  validateFeedback,
  wordTokens,
} from "../schema"
import { practiceFeedback, practiceWav } from "./fixtures"

it("computes half-step totals with fixed American English weights and true N/A", () => {
  const phrase = validateFeedback(practiceFeedback(), "Read it again.")
  expect(overallScore(phrase, "Read it again.")).toBe(7.5)
  const word = practiceFeedback(true)
  word.criteria.stress.score = null
  expect(overallScore(validateFeedback(word, "read"), "read")).toBe(7)
  for (let score = 0; score <= 10; score += 0.5) {
    for (const k of criterionKeys) phrase.criteria[k].score = score
    expect(overallScore(validateFeedback(phrase, "Read it again."), "Read it again.")).toBe(score)
  }
})
it("refuses arbitrary precision, low-confidence grades, invented words and phoneme locations", () => {
  const bad = practiceFeedback()
  bad.criteria.sounds.score = 8.2
  expect(() => validateFeedback(bad, "Read it again.")).toThrow(/./)
  bad.criteria.sounds.score = 8
  bad.confidence = "low"
  expect(() => validateFeedback(bad, "Read it again.")).toThrow(/./)
  bad.confidence = "high"
  bad.findings[0]!.wordEnd = 3
  expect(() => validateFeedback(bad, "Read it again.")).toThrow(/vị trí/)
  bad.findings[0]!.wordStart = null
  bad.findings[0]!.wordEnd = null
  expect(() => validateFeedback(bad, "Read it again.")).toThrow(/vị trí/)
  expect(() => validateFeedback(practiceFeedback(), "read")).toThrow(/từ riêng/)
})
it("never turns noisy or insufficient audio into a number or speculative phoneme findings", () => {
  const retry = practiceFeedback()
  retry.verdict = "retry"
  retry.reason = "noisy"
  retry.confidence = "low"
  retry.findings = []
  for (const k of criterionKeys) retry.criteria[k].score = null
  expect(overallScore(validateFeedback(retry, "Read it again."), "Read it again.")).toBeNull()
  retry.criteria.accuracy.score = 0
  expect(() => validateFeedback(retry, "Read it again.")).toThrow(/./)
})
it("bounds practice text and maintains heteronym context/model/rubric identity", () => {
  expect(wordTokens("Don't re-read café 123.")).toEqual(["Don't", "re", "read", "café", "123"])
  expect(referenceSchema.safeParse("one ".repeat(81)).success).toBe(false)
  expect(referenceSchema.safeParse(" ").success).toBe(false)
  expect(referenceKey("read", "past tense")).not.toBe(referenceKey("read", "present tense"))
  expect(referenceKey("café", "")).toBe(referenceKey("cafe\u0301", ""))
})
it("validates bounded canonical WAV, rejects silence/header spoofing and detects unique recordings", () => {
  expect(validatePracticeWav(practiceWav()).audioMs).toBe(1000)
  expect(validatePracticeWav(practiceWav()).hash).not.toBe(
    validatePracticeWav(practiceWav(441)).hash,
  )
  expect(() => validatePracticeWav(wavBase64(encodePracticeWav(new Float32Array(16000))))).toThrow(
    /im lặng/,
  )
  expect(() => validatePracticeWav("!".repeat(100))).toThrow(/./)
  const bad = encodePracticeWav(new Float32Array(16000))
  bad[22] = 2
  expect(() => validatePracticeWav(wavBase64(bad))).toThrow(/PCM/)
  const tooLong = wavBase64(encodePracticeWav(new Float32Array(16000 * 32)))
  expect(() => validatePracticeWav(tooLong)).toThrow(/./)
  expect(() => validatePracticeWav(wavBase64(encodePracticeWav(new Float32Array(100))))).toThrow(
    /./,
  )
})
it("exports actionable per-attempt evidence without recordings and leaves mixed audio costs unknown", () => {
  const feedback = practiceFeedback()
  const report = pronunciationReport([
    {
      id: "attempt-1",
      evaluationKey: "eval",
      referenceKey: "ref",
      text: "Read it again.",
      context: "present tense",
      audioHash: "hash",
      audioMs: 1000,
      createdAt: 1000,
      rubric: "en-us-v1",
      model: "gpt-audio-1.5",
      feedback,
      score: 7.5,
    },
  ])
  expect(report).toContain("7.5/10")
  expect(report).toContain("âm cuối")
  expect(report).toContain("present tense")
  expect(report).toContain("attempt-1")
  expect(report).not.toContain("base64")
  const entry = {
    status: "complete",
    task: "other",
    model: "gpt-audio-1.5",
    input: 100,
    output: 100,
  } as UsageEntry
  expect(
    estimateUsage(entry, {
      model: entry.model,
      input: 1,
      output: 2,
      cachedInput: 0,
      audioMinute: null,
      checkedAt: "",
    }),
  ).toBeNull()
})
