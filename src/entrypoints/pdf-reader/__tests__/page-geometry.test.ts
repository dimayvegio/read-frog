// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { toView, fromView, pageDelta, canonicalLayer, pageBox } from "../page-geometry"
describe("canonical PDF decorator geometry", () => {
  for (const rotation of [0, 90, 180, 270])
    it(`roundtrips drawing, boxes and deltas at ${rotation}`, () => {
      const page = document.createElement("div")
      page.dataset.viewRotation = String(rotation)
      page.getBoundingClientRect = () =>
        new DOMRect(10, 20, rotation % 180 ? 800 : 600, rotation % 180 ? 600 : 800)
      const original = { x: 0.2, y: 0.3 },
        point = fromView(page, toView(page, original))
      expect(point.x).toBeCloseTo(original.x)
      expect(point.y).toBeCloseTo(original.y)
      const a = toView(page, original),
        b = toView(page, { x: 0.4, y: 0.6 }),
        r = page.getBoundingClientRect()
      const box = pageBox(page, {
        left: r.left + Math.min(a.x, b.x) * r.width,
        right: r.left + Math.max(a.x, b.x) * r.width,
        top: r.top + Math.min(a.y, b.y) * r.height,
        bottom: r.top + Math.max(a.y, b.y) * r.height,
      })
      expect(box.x).toBeCloseTo(0.2)
      expect(box.y).toBeCloseTo(0.3)
      expect(box.width).toBeCloseTo(0.2)
      expect(box.height).toBeCloseTo(0.3)
      const delta = pageDelta(page, (b.x - a.x) * r.width, (b.y - a.y) * r.height)
      expect(delta.x).toBeCloseTo(0.2)
      expect(delta.y).toBeCloseTo(0.3)
      const layer = document.createElement("div")
      canonicalLayer(page, layer)
      expect(layer.style.width).toBe("600px")
      expect(layer.style.height).toBe("800px")
    })
})
