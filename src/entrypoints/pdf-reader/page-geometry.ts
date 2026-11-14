import type { Point, Box } from "./study-data"
export const viewRotation = (page: HTMLElement) => Number(page.dataset.viewRotation) || 0
export function toView(page: HTMLElement, p: Point): Point {
  switch (viewRotation(page)) {
    case 90:
      return { x: 1 - p.y, y: p.x }
    case 180:
      return { x: 1 - p.x, y: 1 - p.y }
    case 270:
      return { x: p.y, y: 1 - p.x }
    default:
      return p
  }
}
export function fromView(page: HTMLElement, p: Point): Point {
  switch (viewRotation(page)) {
    case 90:
      return { x: p.y, y: 1 - p.x }
    case 180:
      return { x: 1 - p.x, y: 1 - p.y }
    case 270:
      return { x: 1 - p.y, y: p.x }
    default:
      return p
  }
}
export function pagePoint(page: HTMLElement, x: number, y: number): Point {
  const r = page.getBoundingClientRect()
  return fromView(page, { x: (x - r.left) / r.width, y: (y - r.top) / r.height })
}
export function pageDelta(page: HTMLElement, dx: number, dy: number): Point {
  const r = page.getBoundingClientRect(),
    a = fromView(page, { x: dx / r.width, y: dy / r.height }),
    b = fromView(page, { x: 0, y: 0 })
  return { x: a.x - b.x, y: a.y - b.y }
}
export function canonicalSize(page: HTMLElement) {
  const r = page.getBoundingClientRect()
  return viewRotation(page) % 180
    ? { width: r.height, height: r.width }
    : { width: r.width, height: r.height }
}
export function pageBox(
  page: HTMLElement,
  rect: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
): Box {
  const corners = [pagePoint(page, rect.left, rect.top), pagePoint(page, rect.right, rect.bottom)]
  return {
    x: Math.min(...corners.map((p) => p.x)),
    y: Math.min(...corners.map((p) => p.y)),
    width: Math.abs(corners[1]!.x - corners[0]!.x),
    height: Math.abs(corners[1]!.y - corners[0]!.y),
  }
}
/** Decorators retain canonical document coordinates; only their view is rotated. */
export function canonicalLayer(page: HTMLElement, node: HTMLElement | SVGElement) {
  const { width, height } = canonicalSize(page),
    r = page.getBoundingClientRect()
  const matrix =
    viewRotation(page) === 90
      ? `matrix(0,1,-1,0,${r.width},0)`
      : viewRotation(page) === 180
        ? `matrix(-1,0,0,-1,${r.width},${r.height})`
        : viewRotation(page) === 270
          ? `matrix(0,-1,1,0,0,${r.height})`
          : "none"
  Object.assign(node.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    right: "auto",
    bottom: "auto",
    width: `${width}px`,
    height: `${height}px`,
    transformOrigin: "0 0",
    transform: matrix,
  })
}

export function viewBox(page: HTMLElement, box: Box): Box {
  const a = toView(page, box),
    b = toView(page, { x: box.x + box.width, y: box.y + box.height })
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}
