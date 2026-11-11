import { GripVertical, RotateCcw, X } from "lucide-react"
import { useLayoutEffect, useRef } from "react"

type Rect = { left: number; top: number; width: number; height: number }
export function StudyPanel({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  const host = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const element = host.current!
    let frame = 0,
      active: { id: number; handle: string; x: number; y: number; from: Rect } | undefined
    const clamp = (r: Rect): Rect => {
      const width = Math.max(Math.min(280, innerWidth - 16), Math.min(innerWidth - 16, r.width))
      const height = Math.max(Math.min(200, innerHeight - 16), Math.min(innerHeight - 16, r.height))
      return {
        width,
        height,
        left: Math.max(8, Math.min(innerWidth - width - 8, r.left)),
        top: Math.max(8, Math.min(innerHeight - height - 8, r.top)),
      }
    }
    let current: Rect
    const paint = () => {
      frame = 0
      Object.assign(element.style, {
        left: `${current.left}px`,
        top: `${current.top}px`,
        width: `${current.width}px`,
        height: `${current.height}px`,
      })
    }
    const reset = () => {
      current = clamp({
        left: 16,
        top: element.closest(".rf-study-tools")!.getBoundingClientRect().bottom + 8,
        width: 370,
        height: Math.min(580, innerHeight * 0.68),
      })
      paint()
    }
    reset()
    const down = (event: PointerEvent) => {
      const handle = (event.target as Element).closest<HTMLElement>("[data-panel-handle]")?.dataset
        .panelHandle
      if (!handle || !event.isPrimary || event.button !== 0 || active) return
      event.preventDefault()
      active = {
        id: event.pointerId,
        handle,
        x: event.clientX,
        y: event.clientY,
        from: { ...current },
      }
      element.setPointerCapture(event.pointerId)
    }
    const delta = (from: Rect, handle: string, dx: number, dy: number) => {
      const r = { ...from }
      if (handle === "move") {
        r.left += dx
        r.top += dy
      } else {
        const minW = Math.min(280, innerWidth - 16),
          minH = Math.min(200, innerHeight - 16)
        if (handle.includes("e"))
          r.width = Math.max(minW, Math.min(innerWidth - r.left - 8, from.width + dx))
        if (handle.includes("s"))
          r.height = Math.max(minH, Math.min(innerHeight - r.top - 8, from.height + dy))
        if (handle.includes("w")) {
          r.left = Math.max(8, Math.min(from.left + from.width - minW, from.left + dx))
          r.width = from.width + from.left - r.left
        }
        if (handle.includes("n")) {
          r.top = Math.max(8, Math.min(from.top + from.height - minH, from.top + dy))
          r.height = from.height + from.top - r.top
        }
      }
      current = clamp(r)
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const move = (event: PointerEvent) => {
      if (active?.id !== event.pointerId) return
      event.preventDefault()
      delta(active.from, active.handle, event.clientX - active.x, event.clientY - active.y)
    }
    const release = () => {
      const previous = active
      active = undefined
      if (previous && element.hasPointerCapture(previous.id))
        element.releasePointerCapture(previous.id)
    }
    const up = (event: PointerEvent) => {
      if (active?.id !== event.pointerId) return
      move(event)
      cancelAnimationFrame(frame)
      paint()
      release()
    }
    const cancel = () => {
      if (!active) return
      current = active.from
      cancelAnimationFrame(frame)
      paint()
      release()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && active) {
        event.stopPropagation()
        event.preventDefault()
        cancel()
        return
      }
      const handle = (event.target as HTMLElement).dataset.panelHandle
      if (!handle || !event.key.startsWith("Arrow")) return
      event.preventDefault()
      event.stopPropagation()
      delta(
        current,
        handle,
        event.key === "ArrowLeft" ? -10 : event.key === "ArrowRight" ? 10 : 0,
        event.key === "ArrowUp" ? -10 : event.key === "ArrowDown" ? 10 : 0,
      )
    }
    const resize = () => {
      cancel()
      current = clamp(current)
      paint()
    }
    element.addEventListener("pointerdown", down)
    element.addEventListener("pointermove", move)
    element.addEventListener("pointerup", up)
    element.addEventListener("pointercancel", cancel)
    element.addEventListener("lostpointercapture", cancel)
    element.addEventListener("keydown", key)
    element.addEventListener("rf-panel-reset", reset)
    window.addEventListener("resize", resize)
    return () => {
      release()
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", resize)
      element.removeEventListener("pointerdown", down)
      element.removeEventListener("pointermove", move)
      element.removeEventListener("pointerup", up)
      element.removeEventListener("pointercancel", cancel)
      element.removeEventListener("lostpointercapture", cancel)
      element.removeEventListener("keydown", key)
      element.removeEventListener("rf-panel-reset", reset)
    }
  }, [])
  return (
    <aside ref={host} className="rf-study-panel" aria-label="Menu PDF">
      <header>
        <button
          type="button"
          className="rf-panel-drag"
          data-panel-handle="move"
          aria-label="Di chuyển khung PDF"
          title="Kéo để di chuyển; phím mũi tên để chỉnh vị trí"
        >
          <GripVertical size={17} />
          <strong>{title}</strong>
        </button>
        <button
          type="button"
          aria-label="Đặt lại khung PDF"
          title="Vị trí và kích thước mặc định"
          onClick={() => host.current?.dispatchEvent(new Event("rf-panel-reset"))}
        >
          <RotateCcw size={16} />
        </button>
        <button type="button" aria-label="Đóng menu PDF" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      <div className="rf-study-panel-content">{children}</div>
      <div className="rf-panel-resizers">
        {["n", "ne", "e", "se", "s", "sw", "w", "nw"].map((handle) => (
          <button
            type="button"
            key={handle}
            data-panel-handle={handle}
            className={`rf-panel-resize rf-panel-${handle}`}
            aria-label={`Đổi kích thước khung PDF ${handle}`}
            title="Kéo đổi kích thước; dùng phím mũi tên"
          />
        ))}
      </div>
    </aside>
  )
}
