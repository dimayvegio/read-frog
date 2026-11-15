// @vitest-environment jsdom
import type { PDFDocumentProxy } from "pdfjs-dist"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { PdfImageCost } from "../image-cost"
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const props = {
  from: "1",
  to: "4",
  fallback: 1,
  rotation: 0,
  dpi: 144,
  model: "gpt-image-2.6-sunburst" as const,
  quality: "low" as const,
  outputSize: "1k" as const,
}
const pdf = {
  numPages: 4,
  getPage: async () => ({ rotate: 0, getViewport: () => ({ width: 612, height: 612 }) }),
} as unknown as PDFDocumentProxy
it("sums the official square-image output estimate for four pages without any network request", async () => {
  const fetcher = vi.fn<(...args: any[]) => any>()
  vi.stubGlobal("fetch", fetcher)
  render(<PdfImageCost {...props} pdf={pdf} />)
  await screen.findByText(/\$0\.09876/u)
  expect(screen.getByText("Tạo mới 4 trang")).toBeTruthy()
  expect(screen.getByText(/Chưa cộng ảnh đầu vào và prompt/u)).toBeTruthy()
  expect(fetcher).not.toHaveBeenCalled()
})
it("replaces an old estimate with unknown for automatic size, rather than displaying a zero fee", async () => {
  const view = render(<PdfImageCost {...props} pdf={pdf} />)
  await screen.findByText(/\$0\.09876/u)
  view.rerender(<PdfImageCost {...props} pdf={pdf} outputSize="auto" />)
  expect(screen.getByText(/kích thước Tự động chưa xác định/u)).toBeTruthy()
  expect(screen.queryByText(/\$0\.09876/u)).toBeNull()
})
