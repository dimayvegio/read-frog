import type { PDFDocumentProxy } from "pdfjs-dist"
import type { OcrPage } from "../study-data"
import { expect, it, vi } from "vitest"
import { PdfTextIndex } from "../text-index"
type Content = { items: { str: string }[] }

it("reuses native text, overrides it with OCR, and evicts by both character and page budgets", async () => {
  const extract = vi.fn<() => Promise<Content>>(async () => ({
    items: [{ str: "Useful Reading" }],
  }))
  const pdf = {
    getPage: vi.fn<() => Promise<{ getTextContent: typeof extract }>>(async () => ({
      getTextContent: extract,
    })),
  } as unknown as PDFDocumentProxy
  const index = new PdfTextIndex(pdf, 100, 2)
  const first = await index.get(1)
  expect(first).toMatchObject({ source: "Useful Reading", folded: "useful reading" })
  expect(await index.get(1)).toBe(first)
  expect(extract).toHaveBeenCalledTimes(1)
  await index.get(2)
  await index.get(3)
  await index.get(1)
  expect(extract).toHaveBeenCalledTimes(4)
  const ocr: OcrPage = {
    page: 1,
    engine: "tesseract7-int-v1",
    language: "eng",
    words: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.1, text: "Corrected" }],
  }
  expect((await index.get(1, ocr)).source).toBe("Corrected")
  expect((await index.get(1)).source).toBe("Useful Reading")
  expect(extract).toHaveBeenCalledTimes(5)
  const characterBound = new PdfTextIndex(pdf, 40, 100)
  await characterBound.get(1)
  await characterBound.get(2)
  await characterBound.get(1)
  expect(extract).toHaveBeenCalledTimes(8)
  characterBound.destroy()
  index.destroy()
  await expect(index.get(1)).rejects.toThrow("đóng")
})
it("deduplicates pending extraction and refuses cache resurrection after close", async () => {
  let finish!: (value: { items: { str: string }[] }) => void
  const extract = vi.fn<() => Promise<Content>>(
    () =>
      new Promise<{ items: { str: string }[] }>((resolve) => {
        finish = resolve
      }),
  )
  const pdf = { getPage: async () => ({ getTextContent: extract }) } as unknown as PDFDocumentProxy
  const index = new PdfTextIndex(pdf)
  const a = index.get(1),
    b = index.get(1)
  await Promise.resolve()
  index.destroy()
  finish({ items: [{ str: "late" }] })
  expect(await a).toEqual(await b)
  expect(extract).toHaveBeenCalledTimes(1)
  await expect(index.get(1)).rejects.toThrow("đóng")
})
