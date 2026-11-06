import { describe, it, expect } from "vitest"
import { assessVocabulary, type StudyWord } from "../learning-assessment"
import { createReviewReport, type ReviewEvent } from "../review-log"
import { reviewReportMarkdown } from "../review-report-markdown"

const word: StudyWord = {
  id: "a".repeat(64),
  word: "reverse",
  meaning: "đảo ngược",
  language: "en",
}
function event(
  index: number,
  result: ReviewEvent["result"],
  options: Partial<ReviewEvent> = {},
): ReviewEvent {
  return {
    id: crypto.randomUUID(),
    sessionId: "11111111-1111-4111-8111-111111111111",
    cardId: word.id,
    occurredAt: 1000 + index,
    mode: "type",
    result,
    word: word.word,
    meaning: word.meaning,
    language: word.language,
    answer: result === "correct" ? "reverse" : "revert",
    elapsedMs: 1000,
    grade: null,
    gradedAt: 0,
    ...options,
  }
}
describe("explainable vocabulary practice flags", () => {
  it("does not call an untested word learned or unlearned", () => {
    const assessment = assessVocabulary([], [word])
    expect(assessment.needsReview).toHaveLength(0)
    expect(assessment.notAssessed[0]!.word).toBe("reverse")
    expect(assessment.recallSignals).toHaveLength(0)
  })
  it.each(["incorrect", "revealed"] as const)(
    "flags a latest %s result with the actual mistake and expected answer",
    (result) => {
      const assessment = assessVocabulary([event(1, result)], [word])
      expect(assessment.needsReview[0]!.recentMistakes[0]).toMatchObject({
        answer: "revert",
        expectedAnswer: "reverse",
        result,
      })
    },
  )
  it("distinguishes self-reported difficulty from objectively checked answers", () => {
    expect(
      assessVocabulary([event(1, "self", { mode: "flash", grade: "good", gradedAt: 1001 })], [word])
        .notAssessed,
    ).toHaveLength(1)
    const assessment = assessVocabulary(
      [event(1, "self", { mode: "flash", grade: "hard", gradedAt: 1001 })],
      [word],
    )
    expect(assessment.needsReview[0]!.evidence.checkedAttempts).toBe(0)
    expect(assessment.needsReview[0]!.reasons.join(" ")).toContain("tự đánh giá")
  })
  it("keeps a word under review after one correct retry instead of hiding the earlier failure", () => {
    const assessment = assessVocabulary([event(1, "incorrect"), event(2, "correct")], [word])
    expect(assessment.needsReview[0]!.evidence.consecutiveCorrect).toBe(1)
    expect(assessment.recallSignals).toHaveLength(0)
  })
  it("recognizes recovery only after repeated correct answers across sessions including typing", () => {
    const assessment = assessVocabulary(
      [
        event(0, "incorrect"),
        event(1, "correct"),
        event(2, "correct", { occurredAt: 86_401_002 }),
        event(3, "correct", {
          occurredAt: 86_401_003,
          sessionId: "22222222-2222-4222-8222-222222222222",
        }),
      ],
      [word],
    )
    expect(assessment.needsReview).toHaveLength(0)
    expect(assessment.recallSignals[0]!.evidence.consecutiveCorrect).toBe(3)
    expect(assessment.recallSignals[0]!.evidence.incorrect).toBe(1)
  })
  it("does not treat guessing in multiple choice or repeating in one session as confirmed recall", () => {
    const events = [event(1, "correct"), event(2, "correct"), event(3, "correct")]
    expect(assessVocabulary(events, [word]).developing).toHaveLength(1)
    expect(
      assessVocabulary(
        events.map((row, index) => ({ ...row, mode: "choice", sessionId: `session-${index}` })),
        [word],
      ).developing,
    ).toHaveLength(1)
  })
  it("uses full history for the current inventory independently of the metric date filter", () => {
    const report = createReviewReport({ id: "book", name: "Sổ" }, [event(1, "incorrect")], {
      now: 30 * 86400000,
      days: 7,
      cards: [word],
    })
    expect(report.summary.attempts).toBe(0)
    expect(report.assessment.needsReview).toHaveLength(1)
    expect(
      createReviewReport(null, [event(1, "incorrect")], { cards: [] }).assessment.needsReview,
    ).toHaveLength(0)
  })
  it("exports a readable report with every flagged word, reasons, mistakes and separate unknown words", () => {
    const report = createReviewReport({ id: "book", name: "Sổ 1" }, [event(1, "incorrect")], {
      cards: [word, { ...word, id: "b".repeat(64), word: "unseen" }],
    })
    const markdown = reviewReportMarkdown(report)
    expect(report.version).toBe(2)
    expect(markdown).toContain("Cần ôn lại")
    expect(markdown).toContain("reverse")
    expect(markdown).toContain("revert")
    expect(markdown).toContain("Lượt gần nhất trả lời sai.")
    expect(markdown).toContain("unseen")
    expect(markdown).toContain("Chưa đủ dữ liệu")
    expect(markdown).not.toMatch(/apiKey|sourceUrl/)
  })
  it("escapes table cells, HTML and line breaks in the readable report", () => {
    const report = createReviewReport({ id: "book", name: "<script>" }, [], {
      cards: [{ ...word, word: "bad|<script>\n# Heading" }],
    })
    const markdown = reviewReportMarkdown(report)
    expect(markdown).not.toContain("<script>")
    expect(markdown).toContain("bad\\|&lt;script&gt; # Heading")
    expect(markdown).not.toContain("\n# Heading")
  })
})
