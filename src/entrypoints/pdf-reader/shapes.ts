import type { Point } from "./study-data"

export type ShapeTool = "circle" | "square" | "rectangle"
// Closed ink paths keep the published annotation format and PDF export compatible.
// Constrain in page pixels when requested, rather than normalized coordinates:
// Shift-circles and squares stay round/square on portrait, landscape and zoom.
export function shapePoints(
  tool: ShapeTool,
  start: Point,
  end: Point,
  width: number,
  height: number,
  constrain = true,
): Point[] {
  let dx = (end.x - start.x) * width,
    dy = (end.y - start.y) * height
  if (tool === "square" || (tool === "circle" && constrain)) {
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
