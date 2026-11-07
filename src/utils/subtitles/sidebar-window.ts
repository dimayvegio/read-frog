import {
  SUBTITLES_SIDEBAR_VIEWPORT_MARGIN,
  SUBTITLES_SIDEBAR_WIDTH,
} from "@/utils/constants/subtitles"

export const SIDEBAR_WINDOW_STORAGE_KEY = "subtitlesSidebarWindowV1"
export const SIDEBAR_MIN_WIDTH = 300
export const SIDEBAR_MIN_HEIGHT = 220
export interface SidebarRect {
  left: number
  top: number
  width: number
  height: number
}
export type SidebarViewport = SidebarRect
export type SidebarResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"
export type SidebarGesture = "move" | SidebarResizeEdge
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n))

export function sidebarViewport(): SidebarViewport {
  const visual = window.visualViewport
  return {
    left: visual?.offsetLeft ?? 0,
    top: visual?.offsetTop ?? 0,
    width: Math.max(1, visual?.width ?? window.innerWidth),
    height: Math.max(1, visual?.height ?? window.innerHeight),
  }
}
function available(viewport: SidebarViewport) {
  const margin = Math.min(
    SUBTITLES_SIDEBAR_VIEWPORT_MARGIN,
    viewport.width / 8,
    viewport.height / 8,
  )
  return {
    left: viewport.left + margin,
    top: viewport.top + margin,
    width: viewport.width - 2 * margin,
    height: viewport.height - 2 * margin,
  }
}
export function defaultSidebarRect(viewport: SidebarViewport): SidebarRect {
  const area = available(viewport),
    width = Math.min(SUBTITLES_SIDEBAR_WIDTH, area.width)
  return { left: area.left + area.width - width, top: area.top, width, height: area.height }
}
export function clampSidebarRect(rect: SidebarRect, viewport: SidebarViewport): SidebarRect {
  const area = available(viewport)
  const width = clamp(rect.width, Math.min(SIDEBAR_MIN_WIDTH, area.width), area.width)
  const height = clamp(rect.height, Math.min(SIDEBAR_MIN_HEIGHT, area.height), area.height)
  return {
    width,
    height,
    left: clamp(rect.left, area.left, area.left + area.width - width),
    top: clamp(rect.top, area.top, area.top + area.height - height),
  }
}
/** Opposite edges stay anchored; resizing never silently moves the whole window. */
export function changeSidebarRect(
  rect: SidebarRect,
  gesture: SidebarGesture,
  dx: number,
  dy: number,
  viewport: SidebarViewport,
): SidebarRect {
  if (gesture === "move")
    return clampSidebarRect({ ...rect, left: rect.left + dx, top: rect.top + dy }, viewport)
  const area = available(viewport),
    minWidth = Math.min(SIDEBAR_MIN_WIDTH, area.width),
    minHeight = Math.min(SIDEBAR_MIN_HEIGHT, area.height)
  const current = clampSidebarRect(rect, viewport)
  let left = current.left,
    right = current.left + current.width,
    top = current.top,
    bottom = current.top + current.height
  if (gesture.includes("w")) left = clamp(left + dx, area.left, right - minWidth)
  if (gesture.includes("e")) right = clamp(right + dx, left + minWidth, area.left + area.width)
  if (gesture.includes("n")) top = clamp(top + dy, area.top, bottom - minHeight)
  if (gesture.includes("s")) bottom = clamp(bottom + dy, top + minHeight, area.top + area.height)
  return { left, top, width: right - left, height: bottom - top }
}
export function savedSidebarRect(value: unknown): SidebarRect | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("rect" in value)
  )
    return null
  const rect = value.rect
  if (
    !rect ||
    typeof rect !== "object" ||
    !["left", "top", "width", "height"].every(
      (key) =>
        key in rect &&
        typeof rect[key as keyof typeof rect] === "number" &&
        Number.isFinite(rect[key as keyof typeof rect]) &&
        Math.abs(rect[key as keyof typeof rect] as number) <= 100000,
    )
  )
    return null
  const parsed = rect as SidebarRect
  return parsed.width > 0 && parsed.height > 0
    ? { left: parsed.left, top: parsed.top, width: parsed.width, height: parsed.height }
    : null
}
export function applySidebarRect(host: HTMLElement, rect: SidebarRect) {
  Object.assign(host.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    right: "auto",
    bottom: "auto",
  })
}
