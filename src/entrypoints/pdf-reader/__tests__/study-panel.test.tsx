// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { clearStudyPanelState, StudyPanel } from "../study-panel"

describe("StudyPanel dimensions and behavior", () => {
  beforeEach(() => {
    clearStudyPanelState()
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1200 })
    Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 900 })
  })

  it("mounts with extended height extending near the bottom of viewport", () => {
    const onClose = vi.fn()
    render(
      <div className="rf-study-tools">
        <StudyPanel title="Tìm trong tài liệu" onClose={onClose}>
          <div>Nội dung tìm kiếm</div>
        </StudyPanel>
      </div>,
    )

    const panel = screen.getByLabelText("Menu PDF")
    expect(panel).toBeInTheDocument()
    // With innerHeight = 900, toolBottom = 80 (fallback), height should be at least 700px (extended)
    const height = parseInt(panel.style.height, 10)
    expect(height).toBeGreaterThan(700)
    expect(panel.style.width).toBe("348px")
  })

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn()
    render(
      <StudyPanel title="Mục lục" onClose={onClose}>
        <div>Tree</div>
      </StudyPanel>,
    )

    const closeBtn = screen.getByLabelText("Đóng menu PDF")
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("resets to default extended dimensions when reset button is clicked", () => {
    const onClose = vi.fn()
    render(
      <StudyPanel title="Bookmarks" onClose={onClose}>
        <div>Bookmarks list</div>
      </StudyPanel>,
    )

    const panel = screen.getByLabelText("Menu PDF")
    // Manually change style to simulate user drag
    panel.style.width = "400px"
    panel.style.height = "500px"

    const resetBtn = screen.getByLabelText("Đặt lại khung PDF")
    fireEvent.click(resetBtn)

    expect(panel.style.width).toBe("348px")
    expect(parseInt(panel.style.height, 10)).toBeGreaterThan(700)
  })
})
