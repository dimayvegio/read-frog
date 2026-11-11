import { expect, it } from "vitest"
import { shapePoints, editBounds, inkBounds, editLinearPoints, linearKind } from "../shapes"
import { validateStudy } from "../study-data"

it("keeps Shift-circles round in physical page coordinates in either drag direction", () => {
  for (const [width, height] of [
    [600, 800],
    [800, 600],
    [1234, 456],
  ]) {
    for (const end of [
      { x: 0.8, y: 0.9 },
      { x: 0.1, y: 0.05 },
    ]) {
      for (const tool of ["circle"] as const) {
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

it("draws horizontal, vertical, reversed and bounded arrows/lines in the frozen ink format", () => {
  for (const tool of ["line", "arrow"] as const) {
    for (const end of [
      { x: 0.8, y: 0.2 },
      { x: 0.2, y: 0.8 },
      { x: 0, y: 0.2 },
      { x: 0.2, y: 0 },
      { x: 1, y: 1 },
    ]) {
      const points = shapePoints(tool, { x: 0.2, y: 0.2 }, end, 600, 800, false)
      expect(points).toHaveLength(tool === "line" ? 2 : 5)
      expect(points[1]).toEqual(end)
      expect(points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)).toBe(true)
      const item = {
        id: tool,
        page: 1,
        kind: "ink" as const,
        color: "#ffca28",
        boxes: [],
        text: tool === "arrow" ? "Mũi tên" : "Đường thẳng",
        points,
      }
      expect(linearKind(item)).toBe(tool)
      expect(() =>
        validateStudy({ id: "a".repeat(64), revision: 0, annotations: [item], ocr: [] }),
      ).not.toThrow()
    }
    expect(shapePoints(tool, { x: 0.2, y: 0.2 }, { x: 0.201, y: 0.201 }, 600, 800, false)).toEqual(
      [],
    )
  }
})
it("snaps in physical pixels and shortens at borders while preserving the snapped direction", () => {
  for (const [width, height] of [
    [600, 800],
    [800, 600],
  ]) {
    for (const end of [
      { x: 1, y: 1 },
      { x: 0, y: 0.2 },
      { x: 0.8, y: 0.31 },
      { x: 0.41, y: 0 },
    ]) {
      const p = shapePoints("line", { x: 0.4, y: 0.3 }, end, width!, height!, true)
      const dx = Math.abs(p[1]!.x - p[0]!.x) * width!,
        dy = Math.abs(p[1]!.y - p[0]!.y) * height!
      expect(Math.min(dx, dy, Math.abs(dx - dy))).toBeLessThan(1e-7)
      expect(p.every((v) => v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1)).toBe(true)
    }
  }
})
it("edits either endpoint without changing its opposite endpoint or collapsing arrowheads", () => {
  const item = {
    id: "arrow",
    page: 1,
    kind: "ink" as const,
    color: "#ffca28",
    boxes: [],
    text: "Mũi tên",
    points: shapePoints("arrow", { x: 0.2, y: 0.3 }, { x: 0.7, y: 0.3 }, 600, 800, false),
  }
  for (const handle of ["start", "end"]) {
    const p = editLinearPoints(item, handle, { x: 0.5, y: 0.8 }, 600, 800)
    expect(p[handle === "start" ? 1 : 0]).toEqual(item.points[handle === "start" ? 1 : 0])
    expect(p[1]).toEqual(p[3])
    expect(Math.hypot((p[2]!.x - p[1]!.x) * 600, (p[2]!.y - p[1]!.y) * 800)).toBeCloseTo(14)
    expect(p[2]).not.toEqual(p[4])
    expect(
      editLinearPoints(item, handle, item.points[handle === "start" ? 1 : 0]!, 600, 800),
    ).toEqual(item.points)
  }
})
it("preserves old square ink as editable, valid data without classifying it as an arrow", () => {
  const item = {
    id: "legacy-square",
    page: 1,
    kind: "ink" as const,
    color: "#ffca28",
    boxes: [],
    text: "",
    points: [
      { x: 0.2, y: 0.2 },
      { x: 0.4, y: 0.2 },
      { x: 0.4, y: 0.35 },
      { x: 0.2, y: 0.35 },
      { x: 0.2, y: 0.2 },
    ],
  }
  expect(linearKind(item)).toBeUndefined()
  const data = { id: "a".repeat(64), revision: 2, annotations: [item], ocr: [] }
  expect(validateStudy(data)).toEqual(data)
  expect(editBounds(inkBounds(item.points), "e", 0.1, 0, 0.01, 0.01).width).toBeCloseTo(0.3)
})
