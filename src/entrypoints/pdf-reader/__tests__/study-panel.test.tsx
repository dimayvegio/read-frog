// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { clearStudyPanelState, StudyPanel } from "../study-panel"

describe("StudyPanel dimensions and behavior", () => {
  beforeEach(() => {
    localStorage.clear()
    clearStudyPanelState()
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1200 })
    Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: 900 })
  })

  it("persists committed sizing across remounts and reserves the actual panel edge", () => {
    const view = render(
      <main className="rf-reader">
        <StudyPanel title="Search" onClose={() => {}}>
          Results
        </StudyPanel>
      </main>,
    )
    const root = view.container.querySelector("main")!
    fireEvent.keyDown(screen.getByLabelText("Đổi kích thước khung PDF e"), { key: "ArrowRight" })
    expect(root.style.getPropertyValue("--rf-study-panel-space")).toBe("374px")
    expect(JSON.parse(localStorage.getItem("rf-study-panel-rect-v1")!).rect.width).toBe(358)
    view.unmount()
    expect(root.style.getPropertyValue("--rf-study-panel-space")).toBe("")
    clearStudyPanelState() // Simulate fresh module state after reload.
    render(
      <StudyPanel title="Outline" onClose={() => {}}>
        Tree
      </StudyPanel>,
    )
    expect(screen.getByLabelText("Menu PDF").style.width).toBe("358px")
  })

  it("does not write during previews or canceled gestures; completed gestures write once", () => {
    render(
      <StudyPanel title="Search" onClose={() => {}}>
        Results
      </StudyPanel>,
    )
    const panel = screen.getByLabelText("Menu PDF")
    panel.setPointerCapture = vi.fn<(...args: any[]) => any>()
    panel.hasPointerCapture = () => false
    const write = vi.spyOn(localStorage, "setItem")
    const point = (target: HTMLElement, type: string, x: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: 100 })
      fireEvent(target, event)
    }
    const edge = screen.getByLabelText("Đổi kích thước khung PDF e")
    point(edge, "pointerdown", 100)
    point(panel, "pointermove", 150)
    expect(write).not.toHaveBeenCalled()
    point(panel, "pointercancel", 150)
    expect(write).not.toHaveBeenCalled()
    point(edge, "pointerdown", 100)
    point(panel, "pointerup", 150)
    expect(write).toHaveBeenCalledOnce()
    expect(JSON.parse(localStorage.getItem("rf-study-panel-rect-v1")!).rect.width).toBe(398)
    write.mockRestore()
  })

  it("ignores corrupt/future preferences and clamps valid geometry to a smaller viewport", () => {
    localStorage.setItem(
      "rf-study-panel-rect-v1",
      JSON.stringify({ version: 2, rect: { left: 1, top: 1, width: 600, height: 600 } }),
    )
    const view = render(
      <StudyPanel title="Search" onClose={() => {}}>
        Results
      </StudyPanel>,
    )
    expect(screen.getByLabelText("Menu PDF").style.width).toBe("348px")
    view.unmount()
    clearStudyPanelState()
    localStorage.setItem(
      "rf-study-panel-rect-v1",
      JSON.stringify({ version: 1, rect: { left: 900, top: 700, width: 600, height: 600 } }),
    )
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 })
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 500 })
    render(
      <StudyPanel title="Search" onClose={() => {}}>
        Results
      </StudyPanel>,
    )
    const panel = screen.getByLabelText("Menu PDF")
    expect(parseInt(panel.style.left, 10) + parseInt(panel.style.width, 10)).toBeLessThanOrEqual(
      382,
    )
    expect(parseInt(panel.style.top, 10) + parseInt(panel.style.height, 10)).toBeLessThanOrEqual(
      492,
    )
  })

  it("mounts with extended height extending near the bottom of viewport", () => {
    const onClose = vi.fn<(...args: any[]) => any>()
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
    const onClose = vi.fn<(...args: any[]) => any>()
    render(
      <StudyPanel title="Mục lục" onClose={onClose}>
        <div>Tree</div>
      </StudyPanel>,
    )

    const closeBtn = screen.getByLabelText("Đóng menu PDF")
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it("keeps the view usable when local preferences cannot be read or saved", () => {
    const read = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("Storage blocked")
    })
    const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("Storage blocked")
    })
    try {
      render(
        <StudyPanel title="Search" onClose={() => {}}>
          Results
        </StudyPanel>,
      )
      fireEvent.click(screen.getByLabelText("Đặt lại khung PDF"))
      expect(screen.getByLabelText("Menu PDF").style.width).toBe("348px")
    } finally {
      read.mockRestore()
      write.mockRestore()
    }
  })

  it("resets to default extended dimensions when reset button is clicked", () => {
    const onClose = vi.fn<(...args: any[]) => any>()
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
