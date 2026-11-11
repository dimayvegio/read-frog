import type { Point } from "./study-data"

export type ShapeTool = "circle" | "square" | "rectangle"
// Closed ink paths keep the published annotation format and PDF export compatible.
// Constrain in page pixels, rather than normalized coordinates: a circle must
// stay round on portrait, landscape, rotated and zoomed pages alike.
export function shapePoints(
  tool: ShapeTool,
  start: Point,
  end: Point,
  width: number,
  height: number,
): Point[] {
  let dx = (end.x - start.x) * width,
    dy = (end.y - start.y) * height
  if (tool !== "rectangle") {
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
