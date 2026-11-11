import type { PDFDocumentProxy } from "pdfjs-dist"
import type { Annotation, Point } from "./study-data"

export async function exportAnnotatedPdf(
  file: Blob,
  pdf: PDFDocumentProxy,
  annotations: Annotation[],
) {
  const { PDFDocument, rgb, PDFName, PDFString, PDFHexString, LineCapStyle } =
    await import("pdf-lib")
  // Never ignore encryption: unsupported protected documents fail explicitly.
  const output = await PDFDocument.load(await file.arrayBuffer())
  for (const number of new Set(annotations.map((a) => a.page))) {
    const source = await pdf.getPage(number),
      viewport = source.getViewport({ scale: 1 })
    const page = output.getPage(number - 1)
    const point = (p: Point) => {
      const [x, y] = viewport.convertToPdfPoint(p.x * viewport.width, p.y * viewport.height)
      return { x: x!, y: y! }
    }
    for (const item of annotations.filter((a) => a.page === number)) {
      const n = Number.parseInt(item.color.slice(1), 16),
        color = rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
      for (const b of item.boxes) {
        const p = point(b),
          q = point({ x: b.x + b.width, y: b.y + b.height })
        page.drawRectangle({
          x: Math.min(p.x, q.x),
          y: Math.min(p.y, q.y),
          width: Math.abs(q.x - p.x),
          height: Math.abs(q.y - p.y),
          color,
          opacity: 0.3,
        })
      }
      if (item.kind === "ink")
        for (let i = 1; i < item.points.length; i++)
          page.drawLine({
            start: point(item.points[i - 1]!),
            end: point(item.points[i]!),
            color,
            thickness: 1.5,
            lineCap: LineCapStyle.Round,
          })
      if (item.kind === "note") {
        const p = point(item.points[0]!)
        const annotation = output.context.obj({
          Type: "Annot",
          Subtype: "Text",
          Rect: [p.x, p.y - 18, p.x + 18, p.y],
          Contents: PDFHexString.fromText(item.text),
          T: PDFString.of("Read Frog"),
          Name: "Comment",
          C: [color.red, color.green, color.blue],
          F: 4,
        })
        page.node.addAnnot(output.context.register(annotation))
        // No additional actions, scripts or links are introduced.
        annotation.delete(PDFName.of("A"))
      }
    }
  }
  return new Blob([new Uint8Array(await output.save())], { type: "application/pdf" })
}
