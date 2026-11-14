import type { PointerEvent } from "react"
import { useEffect, useRef } from "react"
export function usePdfSplitter(
  mode: "percent" | "pixels",
  commit: (value: number) => void,
  storageKey: string,
) {
  const cleanup = useRef<() => void>(() => {})
  useEffect(() => () => cleanup.current(), [])
  return (event: PointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0) return
    cleanup.current()
    const handle = event.currentTarget,
      container = handle.closest<HTMLElement>(".rf-reader-body")
    if (!container) return
    event.preventDefault()
    const property = mode === "percent" ? "--rf-bilingual-width" : "--rf-translation-width"
    let frame = 0,
      value: number | undefined
    const pointer = event.pointerId
    const paint = () => {
      frame = 0
      if (value !== undefined)
        container.style.setProperty(property, `${value}${mode === "percent" ? "%" : "px"}`)
    }
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointer) return
      const box = container.getBoundingClientRect()
      value =
        mode === "percent"
          ? Math.max(25, Math.min(75, ((box.right - next.clientX) / box.width) * 100))
          : Math.min(800, box.width * 0.75, Math.max(260, box.right - next.clientX))
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const finish = (save: boolean) => {
      cancelAnimationFrame(frame)
      container.classList.remove("rf-resizing")
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
      window.removeEventListener("blur", cancel)
      window.removeEventListener("resize", cancel)
      handle.removeEventListener("lostpointercapture", cancel)
      cleanup.current = () => {}
      if (handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer)
      if (save && value !== undefined) {
        commit(value)
        try {
          localStorage.setItem(storageKey, String(value))
        } catch {}
      }
      container.style.removeProperty(property)
    }
    const up = (next: globalThis.PointerEvent) => {
      if (next.pointerId === pointer) {
        move(next)
        finish(true)
      }
    }
    const cancel = () => finish(false)
    cleanup.current = cancel
    container.classList.add("rf-resizing")
    handle.setPointerCapture(pointer)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    window.addEventListener("blur", cancel)
    window.addEventListener("resize", cancel)
    handle.addEventListener("lostpointercapture", cancel)
  }
}
