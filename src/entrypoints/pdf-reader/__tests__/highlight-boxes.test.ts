import { describe, expect, it } from "vitest"
import { mergeHighlightBoxes, type HighlightBox } from "../highlight-boxes"

describe("mergeHighlightBoxes", () => {
  it("returns empty array when given empty input", () => {
    expect(mergeHighlightBoxes([])).toEqual([])
  })

  it("returns single box unchanged", () => {
    const single: HighlightBox = { x: 0.1, y: 0.2, width: 0.5, height: 0.02 }
    expect(mergeHighlightBoxes([single])).toEqual([single])
  })

  it("merges fragmented word rects on the same line into a single line box", () => {
    const wordFragments: HighlightBox[] = [
      { x: 0.1, y: 0.201, width: 0.05, height: 0.019 },
      { x: 0.155, y: 0.2, width: 0.08, height: 0.02 },
      { x: 0.24, y: 0.2, width: 0.1, height: 0.021 },
    ]
    const merged = mergeHighlightBoxes(wordFragments)
    expect(merged).toHaveLength(1)
    expect(merged[0]!.x).toBeCloseTo(0.1, 4)
    expect(merged[0]!.width).toBeCloseTo(0.24, 4)
    expect(merged[0]!.y).toBeCloseTo(0.2, 4)
  })

  it("keeps separate lines distinct when vertical overlap is below threshold", () => {
    const multiLine: HighlightBox[] = [
      // Line 1
      { x: 0.1, y: 0.1, width: 0.4, height: 0.02 },
      { x: 0.51, y: 0.101, width: 0.3, height: 0.02 },
      // Line 2
      { x: 0.1, y: 0.13, width: 0.5, height: 0.02 },
    ]
    const merged = mergeHighlightBoxes(multiLine)
    expect(merged).toHaveLength(2)
    expect(merged[0]!.y).toBeCloseTo(0.1, 4)
    expect(merged[0]!.width).toBeCloseTo(0.71, 4)
    expect(merged[1]!.y).toBeCloseTo(0.13, 4)
    expect(merged[1]!.width).toBeCloseTo(0.5, 4)
  })

  it("keeps large horizontal gaps on the same line separate (e.g. multi-column layout)", () => {
    const twoColumns: HighlightBox[] = [
      { x: 0.1, y: 0.2, width: 0.25, height: 0.02 },
      { x: 0.6, y: 0.2, width: 0.25, height: 0.02 }, // 0.25 gap (25% page width)
    ]
    const merged = mergeHighlightBoxes(twoColumns)
    expect(merged).toHaveLength(2)
    expect(merged[0]!.x).toBe(0.1)
    expect(merged[1]!.x).toBe(0.6)
  })

  it("filters out zero-sized or degenerate rects", () => {
    const input: HighlightBox[] = [
      { x: 0.1, y: 0.2, width: 0.0001, height: 0.02 },
      { x: 0.1, y: 0.2, width: 0.3, height: 0.02 },
      { x: 0.4, y: 0.2, width: 0.2, height: 0.00001 },
    ]
    const merged = mergeHighlightBoxes(input)
    expect(merged).toHaveLength(1)
    expect(merged[0]!.width).toBe(0.3)
  })
})
