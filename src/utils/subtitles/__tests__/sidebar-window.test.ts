import { describe, expect, it } from "vitest"
import {
  changeSidebarRect,
  clampSidebarRect,
  defaultSidebarRect,
  savedSidebarRect,
  type SidebarResizeEdge,
} from "../sidebar-window"

const viewport = { left: 0, top: 0, width: 1280, height: 800 }
const rect = { left: 400, top: 200, width: 400, height: 300 }
describe("movable learning window geometry", () => {
  it("keeps the familiar full-height right-side default", () => {
    expect(defaultSidebarRect(viewport)).toEqual({ left: 864, top: 16, width: 400, height: 768 })
  })
  it("moves both axes while keeping the whole window reachable", () => {
    expect(changeSidebarRect(rect, "move", -100, 80, viewport)).toEqual({
      ...rect,
      left: 300,
      top: 280,
    })
    expect(changeSidebarRect(rect, "move", 10000, -10000, viewport)).toEqual({
      ...rect,
      left: 864,
      top: 16,
    })
  })
  it.each<SidebarResizeEdge>(["n", "s", "e", "w", "ne", "nw", "se", "sw"])(
    "resizes %s with its opposite corner anchored",
    (edge) => {
      const next = changeSidebarRect(rect, edge, 30, 40, viewport)
      expect(next.left).toBe(edge.includes("w") ? 430 : 400)
      expect(next.top).toBe(edge.includes("n") ? 240 : 200)
      expect(next.width).toBe(edge.includes("w") ? 370 : edge.includes("e") ? 430 : 400)
      expect(next.height).toBe(edge.includes("n") ? 260 : edge.includes("s") ? 340 : 300)
    },
  )
  it("enforces minimum dimensions without pushing the opposite edge", () => {
    expect(changeSidebarRect(rect, "nw", 10000, 10000, viewport)).toEqual({
      left: 500,
      top: 280,
      width: 300,
      height: 220,
    })
    expect(changeSidebarRect(rect, "se", -10000, -10000, viewport)).toEqual({
      ...rect,
      width: 300,
      height: 220,
    })
  })
  it("fits mobile, short viewports and viewport changes mid-gesture", () => {
    const mobile = { left: 0, top: 0, width: 320, height: 180 }
    const fitted = clampSidebarRect(rect, mobile)
    expect(fitted).toEqual({ left: 16, top: 16, width: 288, height: 148 })
    expect(changeSidebarRect(rect, "se", 10, 10, mobile)).toEqual(fitted)
  })
  it("accounts for the visible viewport offset during zoom", () => {
    expect(defaultSidebarRect({ left: 100, top: 80, width: 600, height: 400 })).toEqual({
      left: 284,
      top: 96,
      width: 400,
      height: 368,
    })
  })
  it("rejects corrupt or unknown-version local preferences", () => {
    for (const value of [
      null,
      {},
      { version: 2, rect },
      { version: 1, rect: { ...rect, width: 0 } },
      { version: 1, rect: { ...rect, left: Infinity } },
      { version: 1, rect: { ...rect, top: "100" } },
    ])
      expect(savedSidebarRect(value)).toBeNull()
    expect(savedSidebarRect({ version: 1, rect })).toEqual(rect)
  })
})
