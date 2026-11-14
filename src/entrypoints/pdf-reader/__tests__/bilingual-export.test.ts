// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { exportBilingualHtml, exportBilingualMarkdown } from "../bilingual-export"
import type { PdfParagraph } from "../paragraphs"

describe("bilingual export", () => {
  it("formats markdown and html properly without errors", () => {
    const paragraphs: PdfParagraph[] = [
      {
        id: "p1",
        page: 1,
        index: 0,
        text: "Hello world\nSecond line",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    ]
    const translations = {
      rows: {
        p1: {
          page: 1,
          output: "Xin chào thế giới",
          complete: "Xin chào thế giới",
          status: "done" as const,
        },
      },
      busy: false,
      message: "",
    }

    const clickSpy = vi.fn()
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    })
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      ;(node as HTMLAnchorElement).click = clickSpy
      return node
    })
    const removeSpy = vi.spyOn(document.body, "removeChild").mockImplementation((node) => node)

    exportBilingualMarkdown("Test Doc.pdf", paragraphs, translations)
    expect(clickSpy).toHaveBeenCalledTimes(1)

    exportBilingualHtml("Test Doc.pdf", paragraphs, translations)
    expect(clickSpy).toHaveBeenCalledTimes(2)

    appendSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
