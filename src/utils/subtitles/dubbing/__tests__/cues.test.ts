import { describe, expect, it } from "vitest"
import { buildDubbingCues, dubbingWindow } from "../cues"
const track = [
  { text: "Hello", start: 0, end: 1000 },
  { text: "world.", start: 1100, end: 2000 },
  { text: "Next sentence.", start: 2200, end: 3000 },
]
describe("dubbing captions", () => {
  it("groups unfinished native clauses locally without touching CC or short sentences", () => {
    const before = JSON.stringify(track)
    const cues = buildDubbingCues(track, "original")
    expect(cues.map((c) => c.text)).toEqual(["Hello world.", "Next sentence."])
    expect(JSON.stringify(track)).toBe(before)
  })
  it("has stable IDs independent of the playback window", () => {
    const cues = buildDubbingCues(track, "original")
    expect(dubbingWindow(cues, 500)[0]?.id).toBe(dubbingWindow(cues, 1500)[0]?.id)
  })
  it("reads each committed translated fragment once even if it spans native groups", () => {
    const cues = buildDubbingCues(track, "translated", [
      {
        text: "Hello world. Next sentence.",
        translation: "Xin chào. Câu tiếp theo.",
        start: 0,
        end: 3000,
      },
    ])
    expect(cues).toHaveLength(1)
    expect(cues[0]?.text).toBe("Xin chào. Câu tiếp theo.")
  })
  it("never substitutes original text when translations are unavailable", () =>
    expect(buildDubbingCues(track, "translated", track)).toEqual([]))
  it("bounds the prefetch window and splits unicode without corrupting it", () => {
    const cues = buildDubbingCues(
      Array.from({ length: 100 }, (_, i) => ({
        text: "日本語😀".repeat(500) + ".",
        start: i * 10000,
        end: (i + 1) * 10000,
      })),
      "original",
    )
    expect(dubbingWindow(cues, 0).length).toBeLessThanOrEqual(6)
    expect(dubbingWindow(cues, 0).every((c) => c.start <= 30000)).toBe(true)
    expect(
      cues.every((c) => new TextEncoder().encode(c.text).length <= 1600 && !c.text.includes("�")),
    ).toBe(true)
  })
  it("rejects malformed timings and bounds large inventories", () => {
    expect(
      buildDubbingCues(
        [
          { text: "bad", start: -1, end: 5 },
          { text: "bad", start: 0, end: NaN },
          { text: "good.", start: 0, end: 1000 },
        ],
        "original",
      ),
    ).toHaveLength(1)
  })
})
