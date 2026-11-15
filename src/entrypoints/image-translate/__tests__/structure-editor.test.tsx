import type { ImageStructure } from "@/utils/image-translation/structure"
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { ImageStructureEditor } from "../structure-editor"

afterEach(cleanup)
const value: ImageStructure = {
  blocks: [
    { type: "paragraph", text: "First" },
    { type: "paragraph", text: "Second" },
    {
      type: "table",
      header: true,
      rows: [
        ["Name", "Value"],
        ["rst_n", "0"],
      ],
    },
  ],
}
it("shows a real table and commits cell edits only after Save", () => {
  const onChange = vi.fn<(next: ImageStructure) => boolean>().mockReturnValue(true)
  render(<ImageStructureEditor value={value} disabled={false} onChange={onChange} />)
  expect(screen.getByRole("columnheader", { name: "Name" })).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Sửa khối 3" }))
  fireEvent.change(screen.getByRole("textbox", { name: "Hàng 2, cột 2" }), {
    target: { value: "0xF" },
  })
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Lưu chỉnh sửa" }))
  expect(onChange.mock.calls[0]![0].blocks[2]).toEqual({
    type: "table",
    header: true,
    rows: [
      ["Name", "Value"],
      ["rst_n", "0xF"],
    ],
  })
})
it("cancel discards the local draft; merging only joins adjacent paragraphs", () => {
  const onChange = vi.fn<(next: ImageStructure) => boolean>().mockReturnValue(true)
  render(<ImageStructureEditor value={value} disabled={false} onChange={onChange} />)
  fireEvent.click(screen.getByRole("button", { name: "Sửa khối 1" }))
  fireEvent.change(screen.getByRole("textbox", { name: "Nội dung khối 1" }), {
    target: { value: "Discard" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Hủy" }))
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Gộp với đoạn sau" }))
  expect(onChange.mock.calls[0]![0].blocks).toEqual([
    { type: "paragraph", text: "First\nSecond" },
    value.blocks[2],
  ])
})
it("splits paragraphs only after explicit selection and save", () => {
  const onChange = vi.fn<(next: ImageStructure) => boolean>().mockReturnValue(true)
  render(<ImageStructureEditor value={value} disabled={false} onChange={onChange} />)
  fireEvent.click(screen.getByRole("button", { name: "Sửa khối 1" }))
  fireEvent.change(screen.getByRole("textbox", { name: "Nội dung khối 1" }), {
    target: { value: "A\n\nB" },
  })
  fireEvent.click(screen.getByRole("checkbox"))
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Lưu chỉnh sửa" }))
  expect(onChange.mock.calls[0]![0].blocks.slice(0, 2)).toEqual([
    { type: "paragraph", text: "A" },
    { type: "paragraph", text: "B" },
  ])
})
it("removes only the chosen block and prevents deleting the final source block", () => {
  const onChange = vi.fn<(next: ImageStructure) => boolean>().mockReturnValue(true)
  const view = render(<ImageStructureEditor value={value} disabled={false} onChange={onChange} />)
  fireEvent.click(screen.getAllByRole("button", { name: "Bỏ khối" })[1]!)
  expect(onChange.mock.calls[0]![0].blocks).toEqual([value.blocks[0], value.blocks[2]])
  view.rerender(
    <ImageStructureEditor
      value={{ blocks: [value.blocks[0]!] }}
      disabled={false}
      onChange={onChange}
    />,
  )
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Bỏ khối" }).disabled).toBe(true)
})
it("keeps model HTML inert and preserves literal code indentation", () => {
  render(
    <ImageStructureEditor
      value={{
        blocks: [
          { type: "paragraph", text: '<img src="https://bad">' },
          { type: "code", language: "sv", text: "module x;\n  assign a = b;\nendmodule" },
        ],
      }}
      disabled={false}
      onChange={() => true}
    />,
  )
  expect(document.querySelector("img")).toBeNull()
  expect(document.querySelector("pre code")?.textContent).toBe(
    "module x;\n  assign a = b;\nendmodule",
  )
})
