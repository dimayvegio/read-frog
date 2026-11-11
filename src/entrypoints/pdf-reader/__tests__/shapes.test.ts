import { expect, it } from "vitest"
import { shapePoints, editBounds, inkBounds } from "../shapes"
import { validateStudy } from "../study-data"

it("keeps circles round and squares square in physical page coordinates in either drag direction", () => {
  for (const [width, height] of [
    [600, 800],
    [800, 600],
    [1234, 456],
  ]) {
    for (const end of [
      { x: 0.8, y: 0.9 },
      { x: 0.1, y: 0.05 },
    ]) {
      for (const tool of ["circle", "square"] as const) {
        const points = shapePoints(tool, { x: 0.4, y: 0.3 }, end, width!, height!)
        const xs = points.map((p) => p.x),
          ys = points.map((p) => p.y)
        expect((Math.max(...xs) - Math.min(...xs)) * width!).toBeCloseTo(
          (Math.max(...ys) - Math.min(...ys)) * height!,
          8,
        )
        expect(points[0]).toEqual(points.at(-1))
        expect(points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)).toBe(true)
      }
    }
  }
})
it("keeps rectangle dimensions, rejects clicks, and fits the frozen ink format", () => {
  expect(shapePoints("circle", { x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }, 600, 800)).toEqual([])
  const points = shapePoints("rectangle", { x: 0.1, y: 0.2 }, { x: 0.8, y: 0.4 }, 600, 800)
  expect(points).toHaveLength(5)
  expect(points[2]).toEqual({ x: 0.8, y: 0.4 })
  expect(() =>
    validateStudy({
      id: "a".repeat(64),
      revision: 0,
      annotations: [
        { id: "shape", page: 1, kind: "ink", color: "#ffca28", boxes: [], text: "", points },
      ],
      ocr: [],
    }),
  ).not.toThrow()
})
it("supports free ellipses and bounded independent edge/corner resizing and movement", () => {
  const points = shapePoints("circle", { x: 0.1, y: 0.2 }, { x: 0.7, y: 0.4 }, 600, 800, false)
  const bounds = inkBounds(points)
  expect(bounds.width).toBeCloseTo(0.6)
  expect(bounds.height).toBeCloseTo(0.2)
  expect(editBounds(bounds, "e", 0.1, 0.5, 0.01, 0.01)).toMatchObject({
    x: bounds.x,
    y: bounds.y,
    height: bounds.height,
  })
  expect(editBounds(bounds, "s", 0.5, 0.1, 0.01, 0.01).width).toBe(bounds.width)
  for (const direction of ["nw", "n", "ne", "e", "se", "s", "sw", "w", "move"]) {
    for (const delta of [-2, 2]) {
      const result = editBounds(bounds, direction, delta, delta, 0.01, 0.01)
      expect(result.x).toBeGreaterThanOrEqual(0)
      expect(result.y).toBeGreaterThanOrEqual(0)
      expect(result.x + result.width).toBeLessThanOrEqual(1.000001)
      expect(result.y + result.height).toBeLessThanOrEqual(1.000001)
      expect(result.width).toBeGreaterThan(0)
      expect(result.height).toBeGreaterThan(0)
    }
  }
})
