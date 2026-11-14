import React, { useEffect, useRef, useState } from "react"
import { i18n } from "@/utils/i18n"

interface HorizontalPositionBarProps {
  offset: number
  onChange: (offset: number) => void
  containerRef?: React.RefObject<HTMLElement | null>
}

export function HorizontalPositionBar({ offset, onChange, containerRef }: HorizontalPositionBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const [localOffset, setLocalOffset] = useState(offset)
  const isDragging = useRef(false)
  const rafId = useRef(0)

  useEffect(() => {
    if (!isDragging.current) {
      setLocalOffset(offset)
    }
  }, [offset])

  const getContainer = () => {
    return containerRef?.current || barRef.current?.closest<HTMLElement>(".rf-reader-original-column") || null
  }

  const setContainerPan = (val: number, panning: boolean) => {
    const container = getContainer()
    if (container) {
      if (panning) {
        container.dataset.panning = "true"
      } else {
        delete container.dataset.panning
      }
      container.style.setProperty("--rf-pdf-pan-x", `${val}px`)
    }
  }

  const handlePointerDown = () => {
    isDragging.current = true
    const container = getContainer()
    if (container) {
      container.dataset.panning = "true"
    }
  }

  const handlePointerUp = () => {
    if (isDragging.current) {
      isDragging.current = false
      const container = getContainer()
      if (container) {
        delete container.dataset.panning
      }
      onChange(localOffset)
    }
  }

  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    const val = Number((e.target as HTMLInputElement).value)
    setLocalOffset(val)

    if (rafId.current) {
      cancelAnimationFrame(rafId.current)
    }
    rafId.current = requestAnimationFrame(() => {
      setContainerPan(val, true)
    })
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    isDragging.current = false
    setLocalOffset(val)
    setContainerPan(val, false)
    onChange(val)
  }

  const nudge = (delta: number) => {
    const next = Math.max(-500, Math.min(600, localOffset + delta))
    setLocalOffset(next)
    setContainerPan(next, false)
    onChange(next)
  }

  const reset = () => {
    setLocalOffset(0)
    setContainerPan(0, false)
    onChange(0)
  }

  return (
    <div
      ref={barRef}
      className="rf-pdf-horizontal-bar"
      role="region"
      aria-label={i18n.t("pdfReader.horizontalBarLabel") || "Thanh kéo ngang vị trí PDF"}
      title={i18n.t("pdfReader.horizontalBarTitle") || "Kéo thanh trượt để dời vị trí PDF sang ngang · Bấm đúp để căn giữa"}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).tagName !== "BUTTON") {
          reset()
        }
      }}
    >
      <button
        type="button"
        className="rf-pdf-hscroll-btn"
        aria-label={i18n.t("pdfReader.nudgeLeft") || "Dời sang trái"}
        title={i18n.t("pdfReader.nudgeLeftTitle") || "Dời sang trái 30px"}
        onClick={() => nudge(-30)}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className="rf-pdf-hscroll-track-wrapper">
        <input
          type="range"
          min={-500}
          max={600}
          step={1}
          value={localOffset}
          aria-label={i18n.t("pdfReader.horizontalBarLabel") || "Thanh kéo vị trí ngang PDF"}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onInput={handleInput}
          onChange={handleChange}
        />
      </div>

      <button
        type="button"
        className="rf-pdf-hscroll-btn"
        aria-label={i18n.t("pdfReader.nudgeRight") || "Dời sang phải"}
        title={i18n.t("pdfReader.nudgeRightTitle") || "Dời sang phải 30px"}
        onClick={() => nudge(30)}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {localOffset !== 0 && (
        <button
          type="button"
          className="rf-pdf-hscroll-reset"
          aria-label={i18n.t("pdfReader.recenter") || "Căn giữa lại"}
          title={i18n.t("pdfReader.recenterTitle") || "Đưa trang về chính giữa"}
          onClick={reset}
        >
          {i18n.t("pdfReader.recenter") || "Căn giữa"}
        </button>
      )}
    </div>
  )
}
