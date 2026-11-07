import type { StudyWord } from "../study-snapshot"
import { describe, expect, it } from "vitest"
import { createStudyMatcher } from "../study-matcher"
const word = (
  value: string,
  status: StudyWord["status"] = "notAssessed",
  id = value,
): StudyWord => ({
  id,
  word: value,
  meaning: value,
  variants: [value],
  status,
  reason: "Chưa kiểm tra",
  lastAt: null,
  context: "",
})
describe("saved vocabulary range matcher", () => {
  it("matches whole words case-insensitively without matching word prefixes", () => {
    const matches = createStudyMatcher([word("read")])("READ reader bread read.")
    expect(matches.map((row) => [row.start, row.end])).toEqual([
      [0, 4],
      [18, 22],
    ])
  })
  it("escapes regex punctuation and prefers the longer saved phrase", () => {
    const matches = createStudyMatcher([word("take"), word("take off"), word("C++")])(
      "take off with C++",
    )
    expect(matches.map((row) => row.words[0]!.word)).toEqual(["take off", "C++"])
  })
  it("matches phrase whitespace while preserving DOM offsets", () => {
    const matches = createStudyMatcher([word("take off")])("We take\n off now")
    expect(matches[0]).toMatchObject({ start: 3, end: 12 })
  })
  it("keeps accents meaningful and stores no evidence of recall from an encounter", () => {
    const inventory = [word("cần")],
      copy = structuredClone(inventory)
    expect(createStudyMatcher(inventory)("can cần")).toHaveLength(1)
    expect(inventory).toEqual(copy)
  })
  it("normalizes saved phrase spacing and curly apostrophes without matching parts of contractions", () => {
    const text = "can’t 'can' CAN, we take\n off; don't and don’t"
    const matches = createStudyMatcher([word("can"), word("take  off"), word("don’t")])(text)
    expect(matches.map((row) => text.slice(row.start, row.end))).toEqual([
      "can",
      "CAN",
      "take\n off",
      "don't",
      "don’t",
    ])
  })
  it("keeps multiple senses and uses the conservative progress flag", () => {
    const matches = createStudyMatcher([
      word("pitch", "recallSignals", "one"),
      word("pitch", "needsReview", "two"),
    ])("pitch")
    expect(matches[0]!.words).toHaveLength(2)
    expect(matches[0]!.status).toBe("needsReview")
  })
  it("bounds returned ranges for a thousand-word inventory", () => {
    const inventory = Array.from({ length: 1000 }, (_, n) => word(`word${n}`))
    const text = inventory.map((row) => row.word).join(" ")
    expect(createStudyMatcher(inventory)(text, 500)).toHaveLength(500)
  })
})
