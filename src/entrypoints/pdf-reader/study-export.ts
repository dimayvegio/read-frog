import type { PDFDocumentProxy } from "pdfjs-dist"
import type { Annotation, Point } from "./study-data"
import type { TextNote } from "./text-notes"
import type { InkStyle } from "./workspace"

export async function exportAnnotatedPdf(
  file: Blob,
  pdf: PDFDocumentProxy,
  annotations: Annotation[],
  styles: Record<string, InkStyle> = {},
  textNotes: TextNote[] = [],
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
      const style = Object.hasOwn(styles, item.id) ? styles[item.id] : undefined
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
      if (item.kind === "ink") {
        if (
          style &&
          style.fill !== "none" &&
          item.points.length >= 4 &&
          JSON.stringify(item.points[0]) === JSON.stringify(item.points.at(-1))
        ) {
          const fillNumber = Number.parseInt(style.fill.slice(1), 16),
            fill = rgb(
              ((fillNumber >> 16) & 255) / 255,
              ((fillNumber >> 8) & 255) / 255,
              (fillNumber & 255) / 255,
            )
          const path =
            item.points
              .map((p, i) => {
                const q = point(p)
                return `${i ? "L" : "M"} ${q.x} ${-q.y}`
              })
              .join(" ") + " Z"
          page.drawSvgPath(path, { color: fill, opacity: 0.2 * style.opacity, borderWidth: 0 })
        }
        for (let i = 1; i < item.points.length; i++)
          page.drawLine({
            start: point(item.points[i - 1]!),
            end: point(item.points[i]!),
            color,
            thickness: style ? (style.width * viewport.width) / 1000 : 1.5,
            opacity: style?.opacity ?? 1,
            lineCap: LineCapStyle.Round,
          })
      }
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
  for (const note of textNotes) {
    const source = await pdf.getPage(note.page),
      v = source.getViewport({ scale: 1 }),
      page = output.getPage(note.page - 1)
    const width = Math.max(1, Math.ceil(note.width * v.width * 2)),
      height = Math.max(1, Math.ceil(note.height * v.height * 2))
    if (width * height > 16_000_000) throw new Error("Ô chữ quá lớn để xuất.")
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")!
    const font = note.font * v.width * 2
    ctx.font = `${font}px "Segoe UI",sans-serif`
    ctx.fillStyle = note.color
    ctx.textBaseline = "top"
    let y = 0
    for (const row of note.text.split("\n")) {
      let line = ""
      for (const segment of row.split(/(?<=\s)/u)) {
        if (line && ctx.measureText(line + segment).width > width) {
          ctx.fillText(line, 0, y)
          y += font * 1.25
          line = ""
        }
        line += segment
      }
      ctx.fillText(line, 0, y)
      y += font * 1.25
    }
    const png = await output.embedPng(canvas.toDataURL("image/png"))
    const [x, yPdf] = v.convertToPdfPoint(note.x * v.width, (note.y + note.height) * v.height)
    const rotation = source.rotate
    const { degrees } = await import("pdf-lib")
    page.drawImage(png, {
      x: x!,
      y: yPdf!,
      width: note.width * v.width,
      height: note.height * v.height,
      rotate: degrees(rotation),
    })
    canvas.width = canvas.height = 0
  }
  return new Blob([new Uint8Array(await output.save())], { type: "application/pdf" })
}
