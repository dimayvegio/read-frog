import { useAtomValue } from "jotai"
import { useEffect, useRef, useState } from "react"
import { TargetLanguageSelector } from "@/entrypoints/content-runtime/selection/selection-toolbar/translate-button/target-language-selector"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { getLocalConfig } from "@/utils/config/storage"
import { translateOverlayImage } from "@/utils/image-translation/overlay-api"
import {
  clampBox,
  paintOverlay,
  sampleColors,
  type OverlayImage,
  type OverlayRegion,
} from "@/utils/image-translation/overlay-model"

export function ImageOverlayEditor({ value }: { value: OverlayImage }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    wrap = useRef<HTMLDivElement>(null)
  const [bitmap, setBitmap] = useState<ImageBitmap>(),
    [regions, setRegions] = useState(value.regions)
  const [selected, setSelected] = useState(
      value.regions.find((r) => r.enabled)?.id ?? value.regions[0]?.id ?? "",
    ),
    [original, setOriginal] = useState(false)
  const [instructions, setInstructions] = useState("")
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("")
  const [warnings, setWarnings] = useState<string[]>([])
  const [adding, setAdding] = useState(false),
    [zoom, setZoom] = useState("fit")
  const mark = useRef<HTMLDivElement>(null),
    marking = useRef<{ x: number; y: number } | null>(null)
  const nextId = useRef(Math.max(-1, ...value.regions.map((r) => Number(r.id.slice(1)))) + 1)
  const active = regions.find((r) => r.id === selected)
  const owner = useRef(0),
    controller = useRef<AbortController | null>(null)
  const drag = useRef<{
    box: OverlayRegion["box"]
    id: string
    x: number
    y: number
    resize: boolean
    node: HTMLButtonElement
  } | null>(null)
  const urls = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const { targetCode } = useAtomValue(configFieldsAtomMap.language)
  const previousTarget = useRef(targetCode)
  useEffect(() => {
    let canceled = false,
      image: ImageBitmap | undefined
    void (async () => {
      try {
        const response = await fetch(value.image)
        image = await createImageBitmap(await response.blob())
        if (canceled) image.close()
        else setBitmap(image)
      } catch {
        if (!canceled) setError("Không mở được ảnh kết quả.")
      }
    })()
    const abort = () => {
      ++owner.current
      controller.current?.abort()
    }
    window.addEventListener("pagehide", abort)
    const links = urls.current
    return () => {
      canceled = true
      image?.close()
      abort()
      window.removeEventListener("pagehide", abort)
      for (const [url, timer] of links) {
        clearTimeout(timer)
        URL.revokeObjectURL(url)
      }
      links.clear()
    }
  }, [value.image])
  useEffect(() => {
    if (previousTarget.current === targetCode) return
    previousTarget.current = targetCode
    ++owner.current
    controller.current?.abort()
    setBusy(false)
    setRegions((items) => items.map((r) => ({ ...r, translation: "" })))
    setStatus("Đã đổi ngôn ngữ. Bấm Dịch vùng đang bật để tạo ảnh dịch; chưa gọi API.")
  }, [targetCode])
  useEffect(() => {
    if (!bitmap || !canvas.current) return
    setWarnings(
      paintOverlay(canvas.current, bitmap, value.width, value.height, original ? [] : regions),
    )
  }, [bitmap, regions, original, value.width, value.height])
  const update = (id: string, patch: Partial<OverlayRegion>) => {
    ++owner.current
    setRegions((items) => items.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(
        0,
        Math.min(value.width, ((event.clientX - rect.left) / rect.width) * value.width),
      ),
      y: Math.max(
        0,
        Math.min(value.height, ((event.clientY - rect.top) / rect.height) * value.height),
      ),
    }
  }
  const markBox = (p: { x: number; y: number }) => {
    const start = marking.current!
    return {
      x: Math.min(p.x, start.x),
      y: Math.min(p.y, start.y),
      width: Math.abs(p.x - start.x),
      height: Math.abs(p.y - start.y),
    }
  }
  const translate = async (bypass = false) => {
    controller.current?.abort()
    const abort = new AbortController(),
      token = ++owner.current
    controller.current = abort
    setBusy(true)
    setOriginal(false)
    setError("")
    setStatus("Đang dịch theo vị trí vùng chữ…")
    try {
      const config = await getLocalConfig()
      abort.signal.throwIfAborted()
      const result = await translateOverlayImage(
        { ...value, regions },
        config,
        abort.signal,
        bypass,
        instructions,
      )
      if (token === owner.current && !abort.signal.aborted) {
        setRegions(result)
        setStatus("Đã vẽ bản dịch trên ảnh gốc. Chỉnh font/vùng/màu trên máy hoặc tải PNG.")
      }
    } catch (cause) {
      if (token === owner.current && !abort.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Không dịch được ảnh.")
    } finally {
      if (token === owner.current) setBusy(false)
    }
  }
  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>, cancel = false) => {
    const gesture = drag.current
    if (!gesture) return
    gesture.node.style.transform = ""
    gesture.node.style.width = `${(gesture.box.width / value.width) * 100}%`
    gesture.node.style.height = `${(gesture.box.height / value.height) * 100}%`
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    if (cancel || !wrap.current) return
    const scale = wrap.current.getBoundingClientRect().width / value.width
    const dx = (event.clientX - gesture.x) / scale,
      dy = (event.clientY - gesture.y) / scale
    if (Math.abs(dx) + Math.abs(dy) < 1) return
    const box = clampBox(
      gesture.resize
        ? { ...gesture.box, width: gesture.box.width + dx, height: gesture.box.height + dy }
        : { ...gesture.box, x: gesture.box.x + dx, y: gesture.box.y + dy },
      value.width,
      value.height,
    )
    update(gesture.id, { box })
  }
  const download = async () => {
    if (!canvas.current || busy) return
    const token = owner.current
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.current!.toBlob(resolve, "image/png"),
    )
    if (!blob || token !== owner.current) {
      setError("Ảnh đã thay đổi khi xuất; bấm tải lại.")
      return
    }
    const url = URL.createObjectURL(blob),
      link = document.createElement("a")
    link.href = url
    link.download = original ? "FlowRead-anh-goc.png" : "FlowRead-anh-dich.png"
    link.click()
    const links = urls.current
    if (links.size >= 3) {
      const first = links.keys().next().value!
      clearTimeout(links.get(first))
      URL.revokeObjectURL(first)
      links.delete(first)
    }
    links.set(
      url,
      setTimeout(() => {
        URL.revokeObjectURL(url)
        links.delete(url)
      }, 60000),
    )
  }
  return (
    <section className="rf-overlay-editor" aria-label="Dịch trên ảnh gốc">
      <div className="rf-overlay-stage">
        <div
          ref={wrap}
          className="rf-overlay-image"
          style={{
            aspectRatio: `${value.width}/${value.height}`,
            width: zoom === "fit" ? "100%" : `${(value.width * Number(zoom)) / 100}px`,
            maxWidth: zoom === "fit" ? `${value.width}px` : "none",
          }}
        >
          <canvas
            ref={canvas}
            aria-label="Ảnh dịch giữ bố cục gốc"
            tabIndex={0}
            onPointerDown={(e) => {
              if (!adding || busy || !e.isPrimary || e.button !== 0) return
              e.preventDefault()
              marking.current = point(e)
              e.currentTarget.setPointerCapture(e.pointerId)
              e.currentTarget.focus()
            }}
            onPointerMove={(e) => {
              if (!marking.current || !mark.current) return
              const b = markBox(point(e))
              Object.assign(mark.current.style, {
                display: "block",
                left: `${(b.x / value.width) * 100}%`,
                top: `${(b.y / value.height) * 100}%`,
                width: `${(b.width / value.width) * 100}%`,
                height: `${(b.height / value.height) * 100}%`,
              })
            }}
            onPointerUp={(e) => {
              if (!marking.current) return
              const b = markBox(point(e))
              marking.current = null
              if (mark.current) mark.current.style.display = "none"
              e.currentTarget.releasePointerCapture(e.pointerId)
              if (b.width < 8 || b.height < 8) return
              const colors = sampleColors(
                e.currentTarget.getContext("2d")!.getImageData(0, 0, value.width, value.height),
                b,
              )
              const id = `r${nextId.current++}`
              ++owner.current
              setRegions((items) => [
                ...items,
                {
                  id,
                  source: "…",
                  translation: "",
                  box: b,
                  ink: [b],
                  enabled: true,
                  font: "sans-serif",
                  size: 20,
                  color: colors.color,
                  background: null,
                  bold: false,
                  italic: false,
                },
              ])
              setSelected(id)
              setAdding(false)
              setStatus("Đã thêm vùng trên máy. Bấm Dịch vùng đang bật để đọc/dịch vùng mới.")
            }}
            onPointerCancel={() => {
              marking.current = null
              if (mark.current) mark.current.style.display = "none"
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                marking.current = null
                setAdding(false)
                if (mark.current) mark.current.style.display = "none"
              }
            }}
          />
          <div
            ref={mark}
            className="rf-overlay-box selected"
            style={{ display: "none", pointerEvents: "none" }}
          />
          {!original &&
            regions
              .filter((r) => r.enabled || r.id === selected)
              .map((region) => (
                <button
                  type="button"
                  key={region.id}
                  aria-label={`Chọn vùng ${region.id}`}
                  disabled={busy}
                  className={`rf-overlay-box ${selected === region.id ? "selected" : ""} ${!region.enabled ? "disabled" : ""}`}
                  style={{
                    left: `${(region.box.x / value.width) * 100}%`,
                    top: `${(region.box.y / value.height) * 100}%`,
                    width: `${(region.box.width / value.width) * 100}%`,
                    height: `${(region.box.height / value.height) * 100}%`,
                  }}
                  onPointerDown={(e) => {
                    if (busy || !e.isPrimary || e.button !== 0) return
                    e.preventDefault()
                    setSelected(region.id)
                    drag.current = {
                      box: { ...region.box },
                      id: region.id,
                      x: e.clientX,
                      y: e.clientY,
                      resize: (e.target as HTMLElement).dataset.resize === "true",
                      node: e.currentTarget,
                    }
                    e.currentTarget.setPointerCapture(e.pointerId)
                  }}
                  onPointerMove={(e) => {
                    const g = drag.current
                    if (!g || g.node !== e.currentTarget || !wrap.current) return
                    const scale = wrap.current.getBoundingClientRect().width / value.width
                    const dx = (e.clientX - g.x) / scale,
                      dy = (e.clientY - g.y) / scale
                    const b = clampBox(
                      g.resize
                        ? { ...g.box, width: g.box.width + dx, height: g.box.height + dy }
                        : { ...g.box, x: g.box.x + dx, y: g.box.y + dy },
                      value.width,
                      value.height,
                    )
                    if (g.resize) {
                      g.node.style.width = `${(b.width / value.width) * 100}%`
                      g.node.style.height = `${(b.height / value.height) * 100}%`
                    } else
                      g.node.style.transform = `translate(${(b.x - g.box.x) * scale}px,${(b.y - g.box.y) * scale}px)`
                  }}
                  onPointerUp={(e) => finishDrag(e)}
                  onPointerCancel={(e) => finishDrag(e, true)}
                  onClick={() => setSelected(region.id)}
                >
                  <span className="rf-overlay-badge">{Number(region.id.slice(1)) + 1}</span>
                  <span className="rf-overlay-resize" data-resize="true" />
                </button>
              ))}
        </div>
      </div>
      <aside className="rf-overlay-controls">
        <h2>Dịch trên ảnh gốc</h2>
        <p className="rf-overlay-hint">
          PNG · {value.width} × {value.height} px
        </p>
        <TargetLanguageSelector />
        <p className="rf-overlay-hint">
          Ảnh và đường bảng giữ nguyên ngoài vùng thay chữ. Font/nền phức tạp có thể cần chỉnh. OCR
          local đo vị trí; OpenAI đọc và dịch, không đoán tọa độ.
        </p>
        <label>
          <input
            type="checkbox"
            checked={original}
            onChange={(e) => setOriginal(e.target.checked)}
          />
          Xem ảnh gốc
        </label>
        <label>
          Zoom
          <select aria-label="Zoom ảnh" value={zoom} onChange={(e) => setZoom(e.target.value)}>
            <option value="fit">Vừa khung</option>
            <option value="100">100%</option>
            <option value="150">150%</option>
            <option value="200">200%</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy || regions.length >= 256}
          onClick={() => {
            setAdding(!adding)
            setOriginal(true)
            marking.current = null
            if (mark.current) mark.current.style.display = "none"
          }}
        >
          {adding ? "Hủy thêm vùng" : "Thêm vùng chữ"}
        </button>
        {adding && (
          <p className="rf-overlay-warning">
            Kéo trên ảnh gốc để chọn vùng chữ cần đọc/dịch. Esc để hủy; chưa gọi API.
          </p>
        )}
        <label className="rf-overlay-prompt-label">
          <span>
            Yêu cầu bổ sung (Prompt)
            <small>{instructions.length}/4000</small>
          </span>
          <textarea
            className="rf-overlay-prompt-textarea"
            aria-label="Yêu cầu dịch bổ sung"
            value={instructions}
            maxLength={4000}
            disabled={busy}
            spellCheck={false}
            placeholder="Ví dụ: Giữ nguyên thuật ngữ HB1, R/W#, AS; dịch chuẩn ngữ cảnh kỹ thuật..."
            onChange={(e) => setInstructions(e.target.value)}
          />
        </label>
        <div className="rf-overlay-actions">
          <button type="button" disabled={busy} onClick={() => void translate()}>
            Dịch vùng đang bật
          </button>
          <button type="button" disabled={busy} onClick={() => void translate(true)}>
            Tạo lại bản dịch
          </button>
          <button type="button" disabled={!bitmap || busy} onClick={() => void download()}>
            Tải ảnh PNG
          </button>
        </div>
        {busy && (
          <button
            type="button"
            onClick={() => {
              ++owner.current
              controller.current?.abort()
              setBusy(false)
              setStatus("Đã dừng dịch; giữ bản xem trước.")
            }}
          >
            Dừng dịch
          </button>
        )}
        <p role="status">{status}</p>
        {error && (
          <p role="alert" className="rf-image-error">
            {error}
          </p>
        )}
        {warnings.length > 0 && (
          <p className="rf-overlay-warning">
            Vùng {warnings.join(", ")}: chữ nhỏ hoặc chưa vừa. Tăng vùng / rút gọn bản dịch trước
            khi tải.
          </p>
        )}
        <label>
          Vùng chữ
          <select
            aria-label="Chọn vùng chữ"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {Number(r.id.slice(1)) + 1}. {(r.readText ?? r.source).slice(0, 45)}
              </option>
            ))}
          </select>
        </label>
        {active && (
          <fieldset disabled={busy}>
            <label>
              <input
                type="checkbox"
                checked={active.enabled}
                onChange={(e) => update(active.id, { enabled: e.target.checked })}
              />
              Thay chữ trong vùng này
            </label>
            <label>
              Chữ gốc
              <textarea
                aria-label="Chữ gốc vùng chọn"
                value={active.readText ?? active.source}
                maxLength={4000}
                onChange={(e) =>
                  update(active.id, {
                    source: e.target.value,
                    readText: undefined,
                    translation: "",
                  })
                }
              />
            </label>
            <label>
              Bản dịch (sửa không gọi API)
              <textarea
                aria-label="Bản dịch vùng chọn"
                value={active.translation}
                maxLength={8000}
                onChange={(e) => update(active.id, { translation: e.target.value })}
              />
            </label>
            <div className="rf-overlay-grid">
              <label>
                Font
                <select
                  aria-label="Font chữ"
                  value={active.font}
                  onChange={(e) =>
                    update(active.id, { font: e.target.value as OverlayRegion["font"] })
                  }
                >
                  <option value="sans-serif">Sans serif</option>
                  <option value="serif">Serif</option>
                  <option value="monospace">Monospace</option>
                </select>
              </label>
              <label>
                Cỡ tối đa
                <input
                  aria-label="Cỡ chữ"
                  type="number"
                  min={6}
                  max={180}
                  step={0.5}
                  value={active.size}
                  onChange={(e) => {
                    const size = Number(e.target.value)
                    if (Number.isFinite(size))
                      update(active.id, { size: Math.max(6, Math.min(180, size)) })
                  }}
                />
              </label>
              <label>
                Màu chữ
                <input
                  aria-label="Màu chữ"
                  type="color"
                  value={active.color}
                  onChange={(e) => update(active.id, { color: e.target.value })}
                />
              </label>
              <label>
                Màu nền xóa chữ
                <input
                  aria-label="Màu nền xóa chữ"
                  type="color"
                  value={active.background ?? "#ffffff"}
                  onChange={(e) => update(active.id, { background: e.target.value })}
                />
              </label>
            </div>
            <div className="rf-overlay-actions">
              <label>
                <input
                  type="checkbox"
                  checked={active.bold}
                  onChange={(e) => update(active.id, { bold: e.target.checked })}
                />
                Đậm
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={active.italic}
                  onChange={(e) => update(active.id, { italic: e.target.checked })}
                />
                Nghiêng
              </label>
              <button type="button" onClick={() => update(active.id, { background: null })}>
                Nền tự lấy mẫu
              </button>
            </div>
            <div className="rf-overlay-grid">
              {(["x", "y", "width", "height"] as const).map((field) => (
                <label key={field}>
                  {{ x: "X", y: "Y", width: "Rộng", height: "Cao" }[field]}
                  <input
                    aria-label={`Vùng ${field}`}
                    type="number"
                    min={field === "width" || field === "height" ? 4 : 0}
                    max={field === "x" || field === "width" ? value.width : value.height}
                    value={Math.round(active.box[field])}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      if (Number.isFinite(n))
                        update(active.id, {
                          box: clampBox({ ...active.box, [field]: n }, value.width, value.height),
                        })
                    }}
                  />
                </label>
              ))}
            </div>
            <p className="rf-overlay-hint">
              Kéo khung để di chuyển, kéo góc dưới-phải để đổi kích thước. Chỉ vẽ lại khi thả chuột;
              không gọi AI.
            </p>
          </fieldset>
        )}
      </aside>
    </section>
  )
}
