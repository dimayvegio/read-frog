import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist"
import type { GeneratedImage } from "@/utils/image-translation/generated-schema"
import { imageDataURLSchema } from "@/types/image-translation"

export interface RenderedImagePage {
  image: string
  width: number
  height: number
}
export interface TranslatedImagePage {
  page: number
  width: number
  height: number
  result: GeneratedImage
}
/** One temporary render canvas, independent of the three reading canvas leases. */
export async function renderImagePage(
  pdf: PDFDocumentProxy,
  number: number,
  dpi: number,
  rotation: number,
  signal: AbortSignal,
): Promise<RenderedImagePage> {
  signal.throwIfAborted()
  const page = await pdf.getPage(number)
  signal.throwIfAborted()
  const original = page.getViewport({ scale: 1, rotation: ((page.rotate ?? 0) + rotation) % 360 })
  if (
    !(
      original.width > 0 &&
      original.height > 0 &&
      Number.isFinite(original.width * original.height)
    )
  )
    throw new Error("Trang PDF không có kích thước hợp lệ.")
  const scale = Math.min(
    dpi / 72,
    Math.sqrt(8_000_000 / (original.width * original.height)),
    4096 / Math.max(original.width, original.height),
  )
  const viewport = page.getViewport({ scale, rotation: original.rotation })
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))
  let task: RenderTask | undefined
  const abort = () => task?.cancel()
  signal.addEventListener("abort", abort, { once: true })
  try {
    signal.throwIfAborted()
    task = page.render({ canvas, viewport, background: "white" })
    await task.promise
    signal.throwIfAborted()
    const image = canvas.toDataURL("image/png")
    if (!imageDataURLSchema.safeParse(image).success)
      throw new Error(
        "Ảnh trang quá lớn để gửi OpenAI. Chọn độ phân giải thấp hơn rồi bấm tạo lại.",
      )
    return { image, width: original.width, height: original.height }
  } finally {
    signal.removeEventListener("abort", abort)
    task?.cancel()
    canvas.width = canvas.height = 0
    // Do not call page.cleanup(): the reader may be rendering this same page.
  }
}
export async function assembleImagePdf(rows: TranslatedImagePage[], signal: AbortSignal) {
  if (!rows.length || rows.length > 20) throw new Error("Chọn từ 1 đến 20 ảnh trang đã hoàn thành.")
  const { PDFDocument } = await import("pdf-lib")
  const output = await PDFDocument.create()
  for (const row of rows) {
    signal.throwIfAborted()
    const image = await output.embedPng(row.result.image)
    signal.throwIfAborted()
    if (!(row.width > 0 && row.height > 0 && Number.isFinite(row.width * row.height)))
      throw new Error("Khổ trang không hợp lệ.")
    const page = output.addPage([row.width, row.height])
    const scale = Math.min(row.width / image.width, row.height / image.height)
    const width = image.width * scale,
      height = image.height * scale
    page.drawImage(image, {
      x: (row.width - width) / 2,
      y: (row.height - height) / 2,
      width,
      height,
    })
  }
  signal.throwIfAborted()
  const bytes = await output.save()
  signal.throwIfAborted()
  if (bytes.byteLength > 128 * 1024 * 1024)
    throw new Error("PDF ảnh quá lớn. Hãy tải PNG hoặc chọn dải trang ngắn hơn.")
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" })
}
export async function archiveImagePages(rows: TranslatedImagePage[], signal: AbortSignal) {
  if (!rows.length || rows.length > 20) throw new Error("Chọn từ 1 đến 20 ảnh trang đã hoàn thành.")
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()
  for (const row of rows) {
    signal.throwIfAborted()
    zip.file(
      `trang-${String(row.page).padStart(4, "0")}.png`,
      row.result.image.slice("data:image/png;base64,".length),
      { base64: true },
    )
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" }, () =>
    signal.throwIfAborted(),
  )
  signal.throwIfAborted()
  return blob
}
