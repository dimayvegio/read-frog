import { expect, it } from "vitest"
import { buildPronunciationInstructions } from "../prompt"
import { parsePronunciationFeedback, PronunciationResponseError } from "../response"
import { overallScore, validateFeedback, criterionKeys } from "../schema"
import { practiceFeedback } from "./fixtures"

it("recovers the isolated-word response that previously rejected all valid scores because of sentence criteria", () => {
  const wire = practiceFeedback()
  expect(() => validateFeedback(wire, "read")).toThrow(/từ riêng/)
  const feedback = parsePronunciationFeedback(JSON.stringify(wire), "read")
  expect(feedback.criteria.rhythm.score).toBeNull()
  expect(feedback.criteria.fluency.score).toBeNull()
  expect(feedback.criteria.sounds.score).toBe(6.5)
  expect(feedback.criteria.stress.score).toBe(8)
  expect(overallScore(feedback, "read")).toBe(7.5)
})
it("accepts only the three word criteria and appends N/A without inventing stress for a missing assessment", () => {
  const wire = practiceFeedback(true)
  const { sounds, accuracy } = wire.criteria
  const feedback = parsePronunciationFeedback(
    JSON.stringify({ ...wire, criteria: { sounds, accuracy } }),
    "read",
  )
  expect(feedback.criteria.stress.score).toBeNull()
  expect(feedback.criteria.stress.feedback).toContain("không cung cấp")
  expect(overallScore(feedback, "read")).toBe(7)
  expect(() =>
    parsePronunciationFeedback(
      JSON.stringify({ ...wire, criteria: { sounds, accuracy } }),
      "Read it again.",
    ),
  ).toThrow(/PA-SHAPE/)
})
it("ignores malformed irrelevant word criteria while retaining strict valid required scores", () => {
  const wire = practiceFeedback()
  const feedback = parsePronunciationFeedback(
    JSON.stringify({
      ...wire,
      criteria: { ...wire.criteria, rhythm: "N/A", fluency: { score: 99 } },
    }),
    "read",
  )
  expect(feedback.criteria.rhythm.score).toBeNull()
  expect(feedback.criteria.fluency.feedback).toContain("Không áp dụng")
})
it("accepts a single enclosing JSON fence and valid numeric notation, rounds scores to half steps", () => {
  const wire = practiceFeedback()
  const feedback = parsePronunciationFeedback(
    "\uFEFF```json\n" +
      JSON.stringify({
        ...wire,
        criteria: {
          ...wire.criteria,
          sounds: { ...wire.criteria.sounds, score: "8.2/10" },
          accuracy: { ...wire.criteria.accuracy, score: "9,1" },
        },
        nextPractice: "Giữ âm cuối rõ ràng.",
      }) +
      "\n```",
    "read",
  )
  expect(feedback.criteria.sounds.score).toBe(8)
  expect(feedback.criteria.accuracy.score).toBe(9)
  expect(feedback.nextPractice).toEqual(["Giữ âm cuối rõ ràng."])
  expect(() => parsePronunciationFeedback("Some prose\n" + JSON.stringify(wire), "read")).toThrow(
    /PA-JSON/,
  )
  expect(() => parsePronunciationFeedback("```json\n{}\n```\n{}", "read")).toThrow(/PA-JSON/)
})
it("canonicalizes only unambiguous single-word indices and never guesses a missing phrase target", () => {
  const wire = practiceFeedback()
  const findings = [{ ...wire.findings[0], wordStart: 1, wordEnd: 1 }]
  expect(
    parsePronunciationFeedback(JSON.stringify({ ...wire, findings }), "read").findings[0],
  ).toMatchObject({ wordStart: 0, wordEnd: 0 })
  const omitted = [{ ...wire.findings[0], wordStart: undefined, wordEnd: undefined }]
  expect(
    parsePronunciationFeedback(JSON.stringify({ ...wire, findings: omitted }), "read").findings[0],
  ).toMatchObject({ wordStart: 0, wordEnd: 0 })
  expect(() =>
    parsePronunciationFeedback(JSON.stringify({ ...wire, findings: omitted }), "Read it again."),
  ).toThrow(/PA-WORD/)
  expect(() =>
    parsePronunciationFeedback(
      JSON.stringify({ ...wire, findings: [{ ...wire.findings[0], wordEnd: 1000 }] }),
      "read",
    ),
  ).toThrow(/PA-WORD/)
})
it("converts uncertainty and explicit quality retries into a visible unscored result, never an exception or zero", () => {
  for (const signals of [
    { verdict: "assessed", reason: "ok", confidence: "low" },
    { verdict: "retry", reason: "noisy", confidence: "high" },
    { verdict: "assessed", reason: "clipped", confidence: "medium" },
  ]) {
    const feedback = parsePronunciationFeedback(
      JSON.stringify({ ...practiceFeedback(), ...signals, diagnostic: "private provider text" }),
      "read",
    )
    expect(feedback.verdict).toBe("retry")
    expect(overallScore(feedback, "read")).toBeNull()
    for (const key of criterionKeys) expect(feedback.criteria[key].score).toBeNull()
    expect(feedback.findings).toEqual([])
    expect(feedback.strengths).toEqual([])
    expect(JSON.stringify(feedback)).not.toContain("private provider text")
  }
})
it("does not invent required scores from N/A or a vague feedback-only response", () => {
  const wire = practiceFeedback()
  const feedback = parsePronunciationFeedback(
    JSON.stringify({
      ...wire,
      criteria: { ...wire.criteria, sounds: { score: "N/A", feedback: "Chưa nghe đủ rõ âm." } },
    }),
    "read",
  )
  expect(feedback.verdict).toBe("retry")
  expect(feedback.reason).toBe("unclear")
  expect(overallScore(feedback, "read")).toBeNull()
  expect(() => parsePronunciationFeedback('{"overview":"Good!"}', "read")).toThrow(/PA-SHAPE/)
})
it("rejects invalid, out-of-range and fabricated scores without echoing provider values", () => {
  const wire = practiceFeedback()
  for (const score of [11, -1, "90%", "secret-provider-error", "excellent", "8,500"]) {
    expect(() =>
      parsePronunciationFeedback(
        JSON.stringify({
          ...wire,
          criteria: { ...wire.criteria, sounds: { score, feedback: "Nhận xét." } },
        }),
        "read",
      ),
    ).toThrow(/PA-SCORE/)
  }
  const fail = () => {
    parsePronunciationFeedback(
      JSON.stringify({ ...wire, confidence: "secret-key-or-provider-text" }),
      "read",
    )
  }
  expect(fail).toThrow(PronunciationResponseError)
  expect(fail).toThrow(/confidence/)
  expect(fail).not.toThrow(/secret-key/)
})
it("uses an isolated-word prompt with three criteria and a separate five-criterion sentence prompt", () => {
  const word = buildPronunciationInstructions("read"),
    phrase = buildPronunciationInstructions("Read it again.")
  expect(word).toContain("ONE ISOLATED WORD")
  expect(word).toContain('"required":["sounds","stress","accuracy"]')
  expect(word).not.toContain('"score":8')
  expect(phrase).toContain('"required":["sounds","stress","rhythm","fluency","accuracy"]')
  expect(word).toContain("General American")
  expect(word).toContain("Low confidence must never produce a score")
})
