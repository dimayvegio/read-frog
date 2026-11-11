import type { PDFDocumentProxy } from "pdfjs-dist"
import {
  PDFDocument,
  PDFHexString,
  PDFDict,
  PDFName,
  degrees,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib"
import { expect, it } from "vitest"
import { exportAnnotatedPdf } from "../study-export"
it("exports a separate rotated PDF copy with Unicode notes and preserves the original", async () => {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([612, 792])
  page.setRotation(degrees(90))
  const original = await pdf.save(),
    file = new Blob([new Uint8Array(original)])
  const proxy = {
    getPage: async () => ({
      getViewport: () => ({
        width: 792,
        height: 612,
        convertToPdfPoint: (x: number, y: number) => [y, x],
      }),
    }),
  } as unknown as PDFDocumentProxy
  const output = await exportAnnotatedPdf(file, proxy, [
    {
      id: "one",
      page: 1,
      kind: "highlight",
      color: "#ffca28",
      boxes: [{ x: 0.1, y: 0.2, width: 0.5, height: 0.04 }],
      points: [],
      text: "Source",
    },
    {
      id: "two",
      page: 1,
      kind: "ink",
      color: "#42a5f5",
      boxes: [],
      points: [
        { x: 0.2, y: 0.3 },
        { x: 0.3, y: 0.4 },
      ],
      text: "",
    },
    {
      id: "three",
      page: 1,
      kind: "note",
      color: "#66bb6a",
      boxes: [],
      points: [{ x: 0.2, y: 0.3 }],
      text: "Ghi chú tiếng Việt 日本語",
    },
  ])
  const exported = await PDFDocument.load(await output.arrayBuffer())
  expect(exported.getPage(0).getRotation().angle).toBe(90)
  const contents = exported.getPage(0).node.Contents() as PDFArray
  const operations = Array.from({ length: contents.size() }, (_, i) =>
    new TextDecoder().decode(decodePDFRawStream(contents.lookup(i, PDFRawStream)).decode()),
  ).join("\n")
  const translations = operations
    .split("\n")
    .filter((line) => line.endsWith(" cm"))
    .map((line) => line.split(" ").slice(0, 6).map(Number))
  // Rotation maps the visual top-left to PDF coordinates (122.4, 79.2).
  expect(
    translations.some(
      (values) => Math.abs(values[4]! - 122.4) < 0.001 && Math.abs(values[5]! - 79.2) < 0.001,
    ),
  ).toBe(true)
  const annotation = exported.getPage(0).node.Annots()!.lookup(0, PDFDict)
  expect(annotation.lookup(PDFName.of("Contents"), PDFHexString).decodeText()).toBe(
    "Ghi chú tiếng Việt 日本語",
  )
  expect(annotation.has(PDFName.of("A"))).toBe(false)
  expect(
    (await PDFDocument.load(await file.arrayBuffer())).getPage(0).node.Annots(),
  ).toBeUndefined()
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(original)
})
