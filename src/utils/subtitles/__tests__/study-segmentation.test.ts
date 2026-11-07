import { describe, expect, it, vi } from "vitest"
import {
  parseStudyEnds,
  prepareStudyWords,
  studySentences,
  StudySentencePreparation,
  validateStudyWords,
  type StudyWord,
} from "../study-segmentation"

const words = (count = 5): StudyWord[] =>
  Array.from({ length: count }, (_, i) => ({
    text: `word${i}`,
    start: i * 1000,
    end: (i + 1) * 1000,
    estimated: false,
  }))
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

describe("natural listening sentence boundaries", () => {
  it("stays idle and explains missing nearby CC when enabled after the last spoken word", () => {
    const segment = vi.fn<(...args: any[]) => any>(),
      publish = vi.fn<(...args: any[]) => any>()
    const run = new StudySentencePreparation(words(), segment, publish)
    run.update(900000)
    run.update(900500)
    run.update(901000)
    expect(segment).not.toHaveBeenCalled()
    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls[0]![0]).toMatchObject({
      phase: "ready",
      cues: [],
      message: expect.stringContaining("Chưa có CC"),
    })
    run.stop()
  })
  it("preserves complete short sentences and sentences over the display word limit", () => {
    const source = prepareStudyWords([
      { text: "Yes.", start: 0, end: 1000 },
      { text: "I agree.", start: 1000, end: 2000 },
      {
        text: "When we arrived at the station we discovered that the last train had already left without any warning.",
        start: 2000,
        end: 12000,
      },
    ])
    const ends = parseStudyEnds(JSON.stringify({ ends: [0, 2, source.length - 1] }), source)
    const cues = studySentences(source, ends)
    expect(cues.map((cue) => cue.text)).toEqual([
      "Yes.",
      "I agree.",
      "When we arrived at the station we discovered that the last train had already left without any warning.",
    ])
    expect(cues[0]).toMatchObject({ start: 0, end: 1000, estimated: false })
    expect(cues[2]).toMatchObject({ start: 2000, end: 12000, estimated: true })
  })
  it.each([
    "{}",
    '{"ends":[1]}',
    '{"ends":[2,1,4]}',
    '{"ends":[-1,4]}',
    '{"ends":[0.5,4]}',
    '{"ends":[99]}',
    '{"ends":[]}',
  ])("refuses invalid or incomplete model boundaries %s", (response) =>
    expect(() => parseStudyEnds(response, words())).toThrow(/./),
  )
  it("refuses long silences and invented huge sentences", () => {
    const source = words(2)
    source[1]!.start = 4000
    source[1]!.end = 5000
    expect(() => parseStudyEnds('{"ends":[1]}', source)).toThrow(/silence/)
    expect(() => parseStudyEnds('{"ends":[49]}', words(50))).toThrow(/long/)
  })
  it("validates bounded monotonic input before sending it to a provider", () => {
    expect(validateStudyWords(words())).toEqual(words())
    expect(() => validateStudyWords(words(601))).toThrow(/./)
    expect(() => validateStudyWords([{ ...words(1)[0], text: "a".repeat(24001) }])).toThrow(/./)
    expect(() => validateStudyWords([{ ...words(1)[0], start: NaN }])).toThrow(/./)
    expect(() =>
      prepareStudyWords([
        { text: "First", start: 0, end: 1000 },
        { text: "Overlap", start: 0, end: 500 },
      ]),
    ).toThrow(/chồng lấn/)
  })
  it("carries the last unfinished sentence into the next window without losing or repeating words", async () => {
    const source = words(140)
    const segment = vi.fn<(input: StudyWord[], signal: AbortSignal) => Promise<number[]>>(
      async (input) => {
        const ends = []
        for (let i = 9; i < input.length - 1; i += 10) ends.push(i)
        ends.push(input.length - 1)
        return ends
      },
    )
    const publish = vi.fn<(...args: any[]) => any>(),
      run = new StudySentencePreparation(source, segment, publish)
    expect(segment).not.toHaveBeenCalled()
    run.update(0)
    await flush()
    expect(segment).toHaveBeenCalledTimes(2)
    expect(segment.mock.calls[1]![0][0]!.text).toBe("word110")
    const final = publish.mock.calls.at(-1)![0]
    expect(final.phase).toBe("ready")
    expect(final.cues.flatMap((cue: { text: string }) => cue.text.split(" "))).toEqual(
      source.map((word) => word.text),
    )
    run.update(900000)
    await flush()
    expect(segment).toHaveBeenCalledTimes(2)
    run.stop()
  })
  it("aborts in-flight work when stopped and never applies late answers", async () => {
    let finish!: (value: number[]) => void
    const segment = vi.fn<(input: StudyWord[], signal: AbortSignal) => Promise<number[]>>(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const publish = vi.fn<(...args: any[]) => any>(),
      run = new StudySentencePreparation(words(), segment, publish)
    run.update(0)
    run.stop()
    finish([4])
    await flush()
    expect(segment.mock.calls[0]![1].aborted).toBe(true)
    expect(publish.mock.calls.some(([state]) => state.phase === "ready")).toBe(false)
  })
  it("does not silently label a local fallback as AI or retry indefinitely after an error", async () => {
    const segment = vi.fn<(...args: any[]) => any>().mockRejectedValue(new Error("network")),
      publish = vi.fn<(...args: any[]) => any>()
    const run = new StudySentencePreparation(words(), segment, publish)
    run.update(0)
    await flush()
    run.update(500)
    await flush()
    expect(segment).toHaveBeenCalledTimes(1)
    expect(publish.mock.calls.at(-1)![0]).toMatchObject({ phase: "error", cues: [] })
    run.stop()
  })
  it("re-centers a distant seek and rejects late results from the former position", async () => {
    const source = words(400),
      resolvers: ((value: number[]) => void)[] = []
    const segment = vi.fn<(input: StudyWord[], signal: AbortSignal) => Promise<number[]>>(
      () => new Promise((resolve) => resolvers.push(resolve)),
    )
    const publish = vi.fn<(...args: any[]) => any>(),
      run = new StudySentencePreparation(source, segment, publish)
    run.update(0)
    run.update(300000)
    expect(segment.mock.calls[0]![1].aborted).toBe(true)
    resolvers[0]!([9, 19, 29, 39, 49, 59, 69, 79, 89, 99, 109, 119])
    await flush()
    expect(publish.mock.calls.some(([state]) => state.phase === "ready")).toBe(false)
    expect(segment.mock.calls[1]![0][0]!.start).toBe(270000)
    run.stop()
  })
})
