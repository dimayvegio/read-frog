import { describe, it, expect } from "vitest"
import { extractPdfParagraphs, paragraphAt, type PdfTextBox } from "../paragraphs"
const box = (text: string, x: number, y: number, width = 180, height = 12): PdfTextBox => ({
  text,
  x,
  y,
  width,
  height,
})
describe("PDF paragraph layout", () => {
  it("joins wrapped prose, keeps headings/lists separate and leaves source boxes untouched", () => {
    const boxes = [
      box("Reading practice", 50, 50, 300, 20),
      box("Learning a little every day", 50, 100),
      box("helps us remember words.", 50, 116),
      box("• First item", 50, 155),
      box("• Second item", 50, 171),
    ]
    const before = structuredClone(boxes),
      result = extractPdfParagraphs(boxes, 600, 800, 1)
    expect(result.paragraphs.map((item) => item.text)).toEqual([
      "Reading practice",
      "Learning a little every day\nhelps us remember words.",
      "• First item",
      "• Second item",
    ])
    expect(
      result.paragraphs.every(
        (item) =>
          item.x >= 0 && item.y >= 0 && item.x + item.width <= 1 && item.y + item.height <= 1,
      ),
    ).toBe(true)
    expect(boxes).toEqual(before)
  })
  it("keeps CJK OCR fragments together despite small glyph gaps", () => {
    const result = extractPdfParagraphs(
      [box("学", 20, 20, 12, 15), box("习", 34, 20, 12, 15), box("中文", 48, 20, 24, 15)],
      600,
      800,
      1,
    )
    expect(result.paragraphs[0]!.text).toBe("学习中文")
  })
  it("preserves styled word fragments and orders two columns without interleaving their lines", () => {
    const inline = extractPdfParagraphs(
      [box("trans", 20, 20, 25), box("lation", 45, 20, 30), box("works.", 80, 20, 40)],
      600,
      800,
      1,
    )
    expect(inline.paragraphs[0]!.text).toBe("translation works.")
    const columns = [
      box("Heading across both columns", 50, 30, 500, 20),
      ...[100, 116, 132].flatMap((y, i) => [
        box(`Left ${i}`, 50, y, 190),
        box(`Right ${i}`, 340, y, 190),
      ]),
    ]
    const result = extractPdfParagraphs(columns, 600, 800, 3)
    expect(result.paragraphs.map((item) => item.text)).toEqual([
      "Heading across both columns",
      "Left 0\nLeft 1\nLeft 2",
      "Right 0\nRight 1\nRight 2",
    ])
    expect(result.message).toContain("hai cột")
  })
  it("keeps paragraph identity through zoom and exposes scan/density limits without truncating", () => {
    const boxes = [box("A paragraph.", 50, 100), box("Another paragraph.", 50, 200)]
    const normal = extractPdfParagraphs(boxes, 600, 800, 4),
      zoomed = extractPdfParagraphs(
        boxes.map((item) => ({
          ...item,
          x: item.x * 2,
          y: item.y * 2,
          width: item.width * 2,
          height: item.height * 2,
        })),
        1200,
        1600,
        4,
      )
    expect(zoomed.paragraphs).toEqual(normal.paragraphs)
    expect(paragraphAt(normal.paragraphs, 0.26)?.text).toBe("Another paragraph.")
    expect(extractPdfParagraphs([], 600, 800, 1).message).toContain("scan")
    expect(
      extractPdfParagraphs(
        Array.from({ length: 6001 }, () => box("x", 0, 0)),
        600,
        800,
        1,
      ).paragraphs,
    ).toEqual([])
    expect(extractPdfParagraphs([box("x".repeat(20001), 0, 0)], 600, 800, 1).message).toContain(
      "quá dài",
    )
  })
})
