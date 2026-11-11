import type { Annotation, Point } from "./study-data"

export type ShapeTool = "circle" | "rectangle" | "line" | "arrow"
export type LinearTool = "line" | "arrow"
const clip = (n: number) => Math.max(0, Math.min(1, n))

// Lines and arrows are ordinary ink paths, compatible with Study DB1 and export.
export function linearKind(item: Annotation): LinearTool | undefined {
  if (item.kind !== "ink") return undefined
  if (item.points.length === 2) return "line"
  if (
    item.text === "Mũi tên" &&
    item.points.length === 5 &&
    item.points[1]!.x === item.points[3]!.x &&
    item.points[1]!.y === item.points[3]!.y
  )
    return "arrow"
  return undefined
}

export function linearPoints(
  tool: LinearTool,
  start: Point,
  end: Point,
  width: number,
  height: number,
  constrain = false,
  headPixels = 14,
): Point[] {
  start = { x: clip(start.x), y: clip(start.y) }
  end = { x: clip(end.x), y: clip(end.y) }
  let dx = (end.x - start.x) * width,
    dy = (end.y - start.y) * height
  if (constrain) {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
    const length = Math.hypot(dx, dy)
    dx = Math.cos(angle) * length
    dy = Math.sin(angle) * length
    // Shorten the snapped ray at page edges without changing its angle.
    const scale = Math.min(
      1,
      Math.abs(dx) < 1e-8 ? 1 : ((dx < 0 ? start.x : 1 - start.x) * width) / Math.abs(dx),
      Math.abs(dy) < 1e-8 ? 1 : ((dy < 0 ? start.y : 1 - start.y) * height) / Math.abs(dy),
    )
    dx *= scale
    dy *= scale
  }
  const length = Math.hypot(dx, dy)
  if (length < 2) return []
  const tip = constrain ? { x: clip(start.x + dx / width), y: clip(start.y + dy / height) } : end
  if (tool === "line") return [start, tip]
  const head = Math.min(headPixels, length * 0.4),
    angle = Math.atan2(dy, dx)
  const wing = (offset: number) => ({
    x: clip(tip.x - (Math.cos(angle + offset) * head) / width),
    y: clip(tip.y - (Math.sin(angle + offset) * head) / height),
  })
  return [start, tip, wing(Math.PI / 6), tip, wing(-Math.PI / 6)]
}

export function editLinearPoints(
  item: Annotation,
  handle: string,
  target: Point,
  width: number,
  height: number,
  constrain = false,
): Point[] {
  const kind = linearKind(item)
  if (!kind || (handle !== "start" && handle !== "end")) return item.points
  const [start, end] = item.points as [Point, Point]
  const snapped =
    handle === "start"
      ? linearPoints("line", end, target, width, height, constrain)
      : linearPoints("line", start, target, width, height, constrain)
  if (!snapped.length) return item.points
  const head =
    kind === "arrow"
      ? Math.hypot((item.points[2]!.x - end.x) * width, (item.points[2]!.y - end.y) * height)
      : 14
  return linearPoints(
    kind,
    handle === "start" ? snapped[1]! : start,
    handle === "start" ? end : snapped[1]!,
    width,
    height,
    false,
    head,
  )
}

// Closed ink paths keep the published annotation format and PDF export compatible.
// Constrain in page pixels when requested, rather than normalized coordinates:
// Shift-circles stay round on portrait, landscape and zoom.
export function shapePoints(
  tool: ShapeTool,
  start: Point,
  end: Point,
  width: number,
  height: number,
  constrain = true,
): Point[] {
  if (tool === "line" || tool === "arrow")
    return linearPoints(tool, start, end, width, height, constrain)
  let dx = (end.x - start.x) * width,
    dy = (end.y - start.y) * height
  if (tool === "circle" && constrain) {
    const side = Math.min(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx) * side
    dy = Math.sign(dy) * side
  }
  if (Math.abs(dx) < 2 || Math.abs(dy) < 2) return []
  const x = start.x + dx / width,
    y = start.y + dy / height
  if (tool !== "circle") return [start, { x, y: start.y }, { x, y }, { x: start.x, y }, start]
  const cx = (start.x + x) / 2,
    cy = (start.y + y) / 2
  const rx = Math.abs(dx) / width / 2,
    ry = Math.abs(dy) / height / 2
  const points = Array.from({ length: 96 }, (_, index) => {
    const angle = (index / 96) * Math.PI * 2
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) }
  })
  return [...points, points[0]!]
}

export function inkBounds(points: Point[]) {
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y))
  return {
    x,
    y,
    width: Math.max(0.000001, Math.max(...points.map((p) => p.x)) - x),
    height: Math.max(0.000001, Math.max(...points.map((p) => p.y)) - y),
  }
}
export function editBounds(
  box: ReturnType<typeof inkBounds>,
  handle: string,
  dx: number,
  dy: number,
  minX: number,
  minY: number,
) {
  const bound = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
  if (handle === "move")
    return {
      ...box,
      x: bound(box.x + dx, 0, 1 - box.width),
      y: bound(box.y + dy, 0, 1 - box.height),
    }
  let left = box.x,
    top = box.y,
    right = box.x + box.width,
    bottom = box.y + box.height
  if (handle.includes("w")) left = bound(left + dx, 0, right - Math.min(minX, box.width))
  if (handle.includes("e")) right = bound(right + dx, left + Math.min(minX, box.width), 1)
  if (handle.includes("n")) top = bound(top + dy, 0, bottom - Math.min(minY, box.height))
  if (handle.includes("s")) bottom = bound(bottom + dy, top + Math.min(minY, box.height), 1)
  return { x: left, y: top, width: right - left, height: bottom - top }
}
