import { PDFDocument } from "pdf-lib"
import { parsePdfPages } from "./extract-pages"

self.onmessage = async (event: MessageEvent<{ bytes: ArrayBuffer; selection: string }>) => {
  try {
    if (event.data.bytes.byteLength > 200 * 1024 * 1024) throw new Error("File vượt 200 MiB.")
    const source = await PDFDocument.load(event.data.bytes)
    const pages = parsePdfPages(event.data.selection, source.getPageCount())
    const output = await PDFDocument.create()
    // One copier shares fonts/images across the chosen pages.
    for (const page of await output.copyPages(
      source,
      pages.map((n) => n - 1),
    ))
      output.addPage(page)
    const result = new Uint8Array(await output.save())
    if (result.byteLength > 200 * 1024 * 1024) throw new Error("PDF mới vượt 200 MiB.")
    self.postMessage({ bytes: result.buffer, count: pages.length }, { transfer: [result.buffer] })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Không tạo được PDF mới." })
  }
}
