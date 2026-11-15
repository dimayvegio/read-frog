import { describe, expect, it } from "vitest"
import { buildDubbingCues } from "../cues"
import { parseSmartProfile, smartRequestSchema, speakerForCue } from "../smart"
const cues = [
  { text: "Hello", start: 0, end: 1000 },
  { text: "Good morning", start: 1000, end: 2000 },
  { text: "Welcome.", start: 2000, end: 3000 },
]
const speaker = (id = "s1", voice = "marin") => ({
  id,
  voice,
  presentation: "unclear",
  description: "Low, calm voice",
  speed: 1,
  instructions: "Speak calmly.",
})
export const smartFixture = () => ({
  audioMatchesTranscript: true,
  summary: "Một cuộc trò chuyện.",
  context: "Chào hỏi lịch sự.",
  speakers: [speaker(), speaker("s2", "cedar")],
  assignments: [
    { from: 0, to: 0, speaker: "s1", confidence: 0.9 },
    { from: 1, to: 2, speaker: "s2", confidence: 0.9 },
  ],
})
describe("conservative audio speaker mapping", () => {
  it("uses native timing, distinct preset voices and never merges across a speaker turn", () => {
    const p = parseSmartProfile(smartFixture(), cues)
    const grouped = buildDubbingCues(
      cues,
      "original",
      [],
      (c) => speakerForCue(p, cues, c)?.id ?? `unknown:${c.start}`,
    )
    expect(grouped.map((c) => c.text)).toEqual(["Hello", "Good morning Welcome."])
    expect(speakerForCue(p, cues, grouped[0]!)?.voice).toBe("marin")
    expect(speakerForCue(p, cues, grouped[1]!)?.voice).toBe("cedar")
    expect(speakerForCue(p, cues, { start: 0, end: 3000 })).toBeUndefined()
  })
  it("rejects invented caption indices, overlapping ranges, duplicate voices and mismatched audio", () => {
    const invalid = [
      { audioMatchesTranscript: false },
      { assignments: [{ from: 0, to: 3, speaker: "s1", confidence: 1 }] },
      {
        assignments: [
          { from: 0, to: 1, speaker: "s1", confidence: 1 },
          { from: 1, to: 2, speaker: "s2", confidence: 1 },
        ],
      },
      { speakers: [speaker(), speaker("s2")] },
      { assignments: [{ from: 0, to: 0, speaker: "s3", confidence: 1 }] },
    ]
    for (const patch of invalid)
      expect(() => parseSmartProfile({ ...smartFixture(), ...patch }, cues)).toThrow(/./)
  })
  it("falls back for uncertain, missing, mixed, or insufficient audio coverage", () => {
    const p = parseSmartProfile(
      {
        ...smartFixture(),
        assignments: [
          { from: 0, to: 0, speaker: "s1", confidence: 0.6 },
          { from: 2, to: 2, speaker: "s2", confidence: 0.9 },
        ],
      },
      cues,
    )
    expect(speakerForCue(p, cues, cues[0]!)).toBeUndefined()
    expect(speakerForCue(p, cues, cues[1]!)).toBeUndefined()
    expect(speakerForCue(p, cues, { start: 1000, end: 3000 })).toBeUndefined()
    const overlap = [
      { text: "a", start: 0, end: 400 },
      { text: "b", start: 0, end: 400 },
    ]
    const same = parseSmartProfile(
      { ...smartFixture(), assignments: [{ from: 0, to: 1, speaker: "s1", confidence: 1 }] },
      overlap,
    )
    expect(speakerForCue(same, overlap, { start: 0, end: 1000 })).toBeUndefined()
  })
  it("bounds audio, duration, caption order and timeline without changing regular grouping", () => {
    const input = {
      audio: "A".repeat(16),
      format: "wav",
      duration: 3,
      title: "title",
      target: "vi",
      sourceUrl: "https://www.youtube.com/watch?v=test",
      cues,
    }
    expect(smartRequestSchema.safeParse(input).success).toBe(true)
    expect(smartRequestSchema.safeParse({ ...input, duration: 600 }).success).toBe(true)
    for (const patch of [
      { duration: 601 },
      { cues: [...cues].reverse() },
      { duration: 0.1 },
      { audio: "" },
      { cues: [] },
    ])
      expect(smartRequestSchema.safeParse({ ...input, ...patch }).success).toBe(false)
    expect(buildDubbingCues(cues, "original")).toHaveLength(1)
    expect(parseSmartProfile(smartFixture(), cues).trackHash).not.toBe(
      parseSmartProfile(
        smartFixture(),
        cues.map((c) => ({ ...c, text: c.text + "!" })),
      ).trackHash,
    )
  })
})
