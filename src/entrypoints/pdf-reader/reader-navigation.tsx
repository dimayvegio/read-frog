import type { PdfViewport, ViewPosition } from "./viewport"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Minus,
  Plus,
  Maximize,
  Minimize,
  Check,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { parsePdfZoom, stepPdfZoom } from "./zoom"

const presets = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
const percentage = (n: number) => `${Math.round(n * 1000) / 10}%`
export function PdfReaderNavigation({
  viewport,
  view,
  count,
}: {
  viewport: PdfViewport
  view: ViewPosition
  count: number
}) {
  const [draft, setDraft] = useState<string | null>(null),
    [message, setMessage] = useState("")
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement)
  const input = useRef<HTMLInputElement>(null)
  const editing = draft !== null
  const step = (direction: number) => viewport.setZoom(stepPdfZoom(viewport.zoomValue(), direction))
  useEffect(() => {
    if (editing) input.current?.focus()
  }, [editing])
  useEffect(() => {
    const changed = () => setFullscreen(!!document.fullscreenElement)
    const keys = (event: KeyboardEvent) => {
      const target = event.target as Element
      if (
        event.defaultPrevented ||
        !(target instanceof Element) ||
        target.closest("input,textarea,select,[contenteditable=true]")
      )
        return
      if (target !== document.body && !target.closest(".rf-reader")) return
      if (event.ctrlKey || event.metaKey) {
        if (["+", "=", "-", "0"].includes(event.key)) {
          event.preventDefault()
          if (event.key === "0") viewport.setZoom(1)
          else viewport.setZoom(stepPdfZoom(viewport.zoomValue(), event.key === "-" ? -1 : 1))
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault()
          viewport.navigate(event.key === "Home" ? 1 : count)
        }
      } else if (
        target.closest('.rf-pdf-scroll:not([data-annotation-editing="true"])') &&
        ["PageUp", "PageDown"].includes(event.key)
      ) {
        event.preventDefault()
        viewport.navigate(viewport.snapshot().page + (event.key === "PageDown" ? 1 : -1))
      }
    }
    document.addEventListener("fullscreenchange", changed)
    window.addEventListener("keydown", keys)
    return () => {
      document.removeEventListener("fullscreenchange", changed)
      window.removeEventListener("keydown", keys)
    }
  }, [viewport, count])
  const apply = () => {
    const zoom = parsePdfZoom(draft ?? "")
    if (zoom === null) {
      setMessage("Nhập tỷ lệ từ 10% đến 400%.")
      return
    }
    viewport.setZoom(zoom)
    setDraft(null)
    setMessage("")
  }
  return (
    <>
      <div
        className="rf-reader-navigation rf-reader-controls"
        role="group"
        aria-label="Điều hướng và thu phóng PDF"
      >
        <button
          type="button"
          className="rf-reader-icon"
          aria-label="Trang đầu"
          title="Trang đầu (Ctrl+Home)"
          disabled={view.page <= 1}
          onClick={() => viewport.navigate(1)}
        >
          <ChevronsLeft size={16} />
        </button>
        <button
          type="button"
          className="rf-reader-icon"
          aria-label="Trang trước"
          title="Trang trước (Page Up)"
          disabled={view.page <= 1}
          onClick={() => viewport.navigate(view.page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <label>
          Trang{" "}
          <input
            key={view.page}
            aria-label="Số trang"
            type="number"
            min={1}
            max={count}
            defaultValue={view.page}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const page = Number(e.currentTarget.value)
                if (Number.isInteger(page)) viewport.navigate(page)
              }
            }}
            onBlur={(e) => {
              const page = Number(e.currentTarget.value)
              if (Number.isInteger(page)) viewport.navigate(page)
            }}
          />{" "}
          / {count}
        </label>
        <button
          type="button"
          className="rf-reader-icon"
          aria-label="Trang sau"
          title="Trang sau (Page Down)"
          disabled={view.page >= count}
          onClick={() => viewport.navigate(view.page + 1)}
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          className="rf-reader-icon"
          aria-label="Trang cuối"
          title="Trang cuối (Ctrl+End)"
          disabled={view.page >= count}
          onClick={() => viewport.navigate(count)}
        >
          <ChevronsRight size={16} />
        </button>
        <div className="rf-zoom-controls">
          <button
            type="button"
            className="rf-reader-icon"
            aria-label="Thu nhỏ PDF"
            title="Thu nhỏ (Ctrl+−)"
            disabled={viewport.zoomValue() <= 0.10001}
            onClick={() => step(-1)}
          >
            <Minus size={16} />
          </button>
          {draft === null ? (
            <select
              aria-label="Thu phóng"
              value={view.zoom}
              onChange={(e) => {
                if (e.target.value === "custom") {
                  setDraft(percentage(viewport.zoomValue()))
                  setMessage("")
                } else if (e.target.value === "fit-page") viewport.fitPage()
                else
                  viewport.setZoom(
                    e.target.value === "fit-width" ? "fit-width" : Number(e.target.value),
                  )
              }}
            >
              <option value="fit-width">Vừa chiều rộng</option>
              <option value="fit-page">Vừa trang hiện tại</option>
              {typeof view.zoom === "number" && !presets.includes(view.zoom) && (
                <option value={view.zoom}>{percentage(view.zoom)}</option>
              )}
              {presets.map((n) => (
                <option key={n} value={n}>
                  {percentage(n)}
                </option>
              ))}
              <option value="custom">Nhập tỷ lệ…</option>
            </select>
          ) : (
            <>
              <input
                ref={input}
                aria-label="Tỷ lệ thu phóng tùy chỉnh"
                inputMode="decimal"
                maxLength={12}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    apply()
                  } else if (e.key === "Escape") {
                    e.stopPropagation()
                    setDraft(null)
                    setMessage("")
                  }
                }}
              />
              <button
                type="button"
                className="rf-reader-icon"
                aria-label="Áp dụng tỷ lệ"
                title="Áp dụng (Enter)"
                onClick={apply}
              >
                <Check size={16} />
              </button>
            </>
          )}
          <button
            type="button"
            className="rf-reader-icon"
            aria-label="Phóng to PDF"
            title="Phóng to (Ctrl++)"
            disabled={viewport.zoomValue() >= 3.99999}
            onClick={() => step(1)}
          >
            <Plus size={16} />
          </button>
        </div>
        <button
          type="button"
          className="rf-reader-icon"
          aria-label={fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình PDF"}
          aria-pressed={fullscreen}
          title={fullscreen ? "Thoát toàn màn hình (Esc)" : "Toàn màn hình"}
          onClick={() => {
            const root = viewport.element.closest<HTMLElement>(".rf-reader")
            const request = document.fullscreenElement
              ? document.exitFullscreen()
              : root?.requestFullscreen()
            void request?.catch(() =>
              setMessage("Trình duyệt chưa cho mở toàn màn hình. Hãy bấm nút lại."),
            )
          }}
        >
          {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
      </div>
      {message && (
        <p role="alert" className="rf-reader-control-message">
          {message}
        </p>
      )}
    </>
  )
}
