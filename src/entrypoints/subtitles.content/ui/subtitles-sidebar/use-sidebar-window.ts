import type { KeyboardEvent, PointerEvent } from "react"
import type { SidebarGesture, SidebarRect } from "@/utils/subtitles/sidebar-window"
import { useId, useLayoutEffect, useRef } from "react"
import { browser } from "#imports"
import {
  applySidebarRect,
  changeSidebarRect,
  clampSidebarRect,
  defaultSidebarRect,
  savedSidebarRect,
  sidebarViewport,
  SIDEBAR_WINDOW_STORAGE_KEY,
} from "@/utils/subtitles/sidebar-window"

const hostPreferences = new WeakMap<HTMLElement, SidebarRect | null>()
interface Gesture {
  pointerId: number
  x: number
  y: number
  rect: SidebarRect
  kind: SidebarGesture
  target: HTMLElement
}

/** Transient pointer geometry lives in refs/CSS, not in the transcript's React tree. */
export function useSidebarWindow() {
  const rootRef = useRef<HTMLDivElement>(null),
    hostRef = useRef<HTMLElement | null>(null)
  const rectRef = useRef<SidebarRect | null>(null),
    preferredRef = useRef<SidebarRect | null>(null)
  const gestureRef = useRef<Gesture | null>(null),
    dirtyRef = useRef(false)
  const frameRef = useRef(0),
    saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const helpId = useId()
  const paint = () => {
    if (hostRef.current && rectRef.current) applySidebarRect(hostRef.current, rectRef.current)
  }
  const flush = () => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
    paint()
  }
  const save = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    const host = hostRef.current,
      rect = preferredRef.current
    if (!host || !rect) return
    hostPreferences.set(host, { ...rect })
    void browser.storage.local
      .set({ [SIDEBAR_WINDOW_STORAGE_KEY]: { version: 1, rect: { ...rect } } })
      .catch(() => {})
  }
  const finish = (persist = true) => {
    const gesture = gestureRef.current
    if (!gesture) return
    gestureRef.current = null
    flush()
    hostRef.current?.style.removeProperty("user-select")
    if (hostRef.current) delete hostRef.current.dataset.sidebarGesture
    try {
      if (gesture.target.hasPointerCapture?.(gesture.pointerId))
        gesture.target.releasePointerCapture(gesture.pointerId)
    } catch {
      /* The pointer may already have been cancelled. */
    }
    if (persist) save()
  }

  useLayoutEffect(() => {
    const root = rootRef.current?.getRootNode()
    if (!(root instanceof ShadowRoot) || !(root.host instanceof HTMLElement)) return undefined
    const host = root.host
    hostRef.current = host
    const cached = hostPreferences.has(host)
    preferredRef.current = hostPreferences.get(host) ?? null
    const update = () => {
      finish()
      rectRef.current = preferredRef.current
        ? clampSidebarRect(preferredRef.current, sidebarViewport())
        : defaultSidebarRect(sidebarViewport())
      flush()
    }
    update()
    let disposed = false
    if (!cached)
      void browser.storage.local
        .get(SIDEBAR_WINDOW_STORAGE_KEY)
        .then((data) => {
          if (disposed || dirtyRef.current) return
          preferredRef.current = savedSidebarRect(data[SIDEBAR_WINDOW_STORAGE_KEY])
          hostPreferences.set(host, preferredRef.current)
          update()
        })
        .catch(() => {})
    const blur = () => finish()
    window.addEventListener("resize", update)
    window.addEventListener("blur", blur)
    document.addEventListener("fullscreenchange", update)
    window.visualViewport?.addEventListener("resize", update)
    window.visualViewport?.addEventListener("scroll", update)
    return () => {
      disposed = true
      finish()
      if (saveTimerRef.current) save()
      cancelAnimationFrame(frameRef.current)
      window.removeEventListener("resize", update)
      window.removeEventListener("blur", blur)
      document.removeEventListener("fullscreenchange", update)
      window.visualViewport?.removeEventListener("resize", update)
      window.visualViewport?.removeEventListener("scroll", update)
      hostRef.current = null
    }
    // eslint-disable-next-line react/exhaustive-effect-dependencies -- One host-bound controller; callbacks read current refs only.
  }, [])

  const start = (event: PointerEvent<HTMLElement>, kind: SidebarGesture) => {
    if (event.button !== 0 || !event.isPrimary || gestureRef.current || !rectRef.current) return
    const target = event.target as Element
    if (
      kind === "move" &&
      target.closest("button,a,input,select,textarea,[role=tab]") &&
      !target.closest("[data-sidebar-move]")
    )
      return
    dirtyRef.current = true
    gestureRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rect: { ...rectRef.current },
      kind,
      target: event.currentTarget,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* Detached/cancelled pointers do not own capture. */
    }
    if (hostRef.current) {
      hostRef.current.style.userSelect = "none"
      hostRef.current.dataset.sidebarGesture = kind
    }
    event.preventDefault()
    event.stopPropagation()
  }
  const move = (event: PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current
    if (!gesture || event.pointerId !== gesture.pointerId) return
    rectRef.current = changeSidebarRect(
      gesture.rect,
      gesture.kind,
      event.clientX - gesture.x,
      event.clientY - gesture.y,
      sidebarViewport(),
    )
    preferredRef.current = rectRef.current
    if (!frameRef.current)
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0
        paint()
      })
    event.preventDefault()
    event.stopPropagation()
  }
  const end = (event: PointerEvent<HTMLElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return
    finish()
    event.stopPropagation()
  }
  const key = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || !rectRef.current) return
    const delta = (
      { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] } as const
    )[event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"]
    if (!delta) return
    dirtyRef.current = true
    rectRef.current = changeSidebarRect(
      rectRef.current,
      event.shiftKey ? "se" : "move",
      delta[0],
      delta[1],
      sidebarViewport(),
    )
    preferredRef.current = rectRef.current
    flush()
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(save, 200)
    event.preventDefault()
    event.stopPropagation()
  }
  const reset = () => {
    dirtyRef.current = true
    finish(false)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    preferredRef.current = null
    if (hostRef.current) hostPreferences.set(hostRef.current, null)
    rectRef.current = defaultSidebarRect(sidebarViewport())
    flush()
    void browser.storage.local.remove(SIDEBAR_WINDOW_STORAGE_KEY).catch(() => {})
  }
  return { rootRef, helpId, start, move, end, key, reset }
}
