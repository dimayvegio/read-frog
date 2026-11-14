// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { HorizontalPositionBar } from "../horizontal-position-bar"

describe("HorizontalPositionBar", () => {
  it("renders with current offset", () => {
    render(<HorizontalPositionBar offset={50} onChange={vi.fn<(...args: any[]) => any>()} />)
    const slider = screen.getByRole("slider")
    expect(slider).toHaveValue("50")
  })

  it("calls onChange when slider value is changed", () => {
    const onChange = vi.fn<(...args: any[]) => any>()
    render(<HorizontalPositionBar offset={0} onChange={onChange} />)
    const slider = screen.getByRole("slider")
    fireEvent.change(slider, { target: { value: "120" } })
    expect(onChange).toHaveBeenCalledWith(120)
  })

  it("resets to 0 on double click", () => {
    const onChange = vi.fn<(...args: any[]) => any>()
    render(<HorizontalPositionBar offset={180} onChange={onChange} />)
    const container = screen.getByRole("region", { name: "pdfReader.horizontalBarLabel" })
    fireEvent.doubleClick(container)
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it("nudges left and right with arrow buttons", () => {
    const onChange = vi.fn<(...args: any[]) => any>()
    render(<HorizontalPositionBar offset={0} onChange={onChange} />)
    const leftBtn = screen.getByLabelText("pdfReader.nudgeLeft")
    const rightBtn = screen.getByLabelText("pdfReader.nudgeRight")

    fireEvent.click(leftBtn)
    expect(onChange).toHaveBeenCalledWith(-30)

    fireEvent.click(rightBtn)
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it("displays reset button when offset is non-zero and resets on click", () => {
    const onChange = vi.fn<(...args: any[]) => any>()
    const { rerender } = render(<HorizontalPositionBar offset={0} onChange={onChange} />)
    expect(screen.queryByLabelText("pdfReader.recenter")).toBeNull()

    rerender(<HorizontalPositionBar offset={60} onChange={onChange} />)
    const resetBtn = screen.getByLabelText("pdfReader.recenter")
    expect(resetBtn).toBeInTheDocument()

    fireEvent.click(resetBtn)
    expect(onChange).toHaveBeenCalledWith(0)
  })
})
