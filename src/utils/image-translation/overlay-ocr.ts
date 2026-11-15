import type { Page, Worker } from "tesseract.js"
import { browser } from "#imports"
import { imageDataURLSchema } from "@/types/image-translation"
import { clampBox, sampleColors, type OverlayRegion, type PixelBox } from "./overlay-model"

let currentLease: object | undefined
const union = (boxes: PixelBox[]): PixelBox => {
  const x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y))
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  }
}
export function overlayRegions(data: Pick<Page, "blocks">, pixels: ImageData): OverlayRegion[] {
  const regions: OverlayRegion[] = []
  let words = 0
  for (const block of data.blocks ?? [])
    for (const paragraph of block.paragraphs)
      for (const line of paragraph.lines) {
        let group: { text: string; box: PixelBox; font: string }[] = []
        const flush = () => {
          if (!group.length) return
          const ink = group.map((w) => w.box),
            source = group.map((w) => w.text).join(" "),
            box = union(ink)
          const colors = sampleColors(pixels, ink[0]!)
          regions.push({
            id: `r${regions.length}`,
            source,
            translation: "",
            ink,
            box: clampBox(
              { ...box, y: box.y - box.height * 0.15, height: box.height * 1.5 },
              pixels.width,
              pixels.height,
            ),
            enabled:
              /\p{L}/u.test(source) &&
              !/[{};]|^(?:module|endmodule|assign|end|begin|#include)\b|^always_/u.test(source),
            font: /mono|courier|consolas/iu.test(group[0]!.font)
              ? "monospace"
              : /times|georgia|serif/iu.test(group[0]!.font)
                ? "serif"
                : "sans-serif",
            size: Math.max(8, Math.min(180, box.height * 1.25)),
            color: colors.color,
            background: null,
            bold: /bold/iu.test(group[0]!.font),
            italic: /italic/iu.test(group[0]!.font),
          })
          group = []
        }
        for (const word of line.words) {
          if (++words > 6000) throw new Error("Ảnh quá nhiều chữ. Hãy chọn vùng nhỏ hơn.")
          const { x0, y0, x1, y1 } = word.bbox
          if (
            ![x0, y0, x1, y1].every(Number.isFinite) ||
            x1 <= x0 ||
            y1 <= y0 ||
            x0 < 0 ||
            y0 < 0 ||
            x1 > pixels.width ||
            y1 > pixels.height
          )
            continue
          const text = word.text.normalize("NFC").trim()
          if (!text) continue
          const previous = group.at(-1)
          // Large inter-word gaps usually separate table cells/columns; never paint across that gap.
          if (previous && x0 - previous.box.x - previous.box.width > Math.max(20, (y1 - y0) * 1.8))
            flush()
          group.push({
            text,
            box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
            font: word.font_name ?? "",
          })
        }
        flush()
      }
  if (regions.length > 256 || regions.reduce((n, r) => n + r.source.length, 0) > 20000)
    throw new Error("Tối đa 256 vùng / 20.000 ký tự; hãy crop nhỏ hơn.")
  regions.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
  regions.forEach((r, i) => {
    r.id = `r${i}`
  })
  // Use nearby whitespace for longer translations, stopping at the next source box.
  for (const region of regions) {
    let right = Math.min(
      pixels.width - 2,
      region.box.x + Math.max(region.box.width, region.box.width * 1.35),
    )
    for (const next of regions)
      if (
        next !== region &&
        next.box.x > region.box.x &&
        next.box.y < region.box.y + region.box.height &&
        next.box.y + next.box.height > region.box.y
      )
        right = Math.min(right, next.box.x - 4)
    // Stop at visible table rules: tall, continuous contrast relative to the local background.
    const bg = sampleColors(pixels, region.ink[0]!)
      .background.match(/[a-f0-9]{2}/gu)!
      .map((c) => parseInt(c, 16))
    const top = Math.max(0, Math.floor(region.box.y - region.box.height * 0.3)),
      bottom = Math.min(pixels.height - 1, Math.ceil(region.box.y + region.box.height * 1.3))
    for (let x = Math.ceil(region.box.x + region.box.width + 2); x < right; x++) {
      let contrast = 0,
        samples = 0
      for (let y = top; y <= bottom; y += 2) {
        const i = (y * pixels.width + x) * 4
        samples++
        if (bg.reduce((n, c, k) => n + Math.abs(c - pixels.data[i + k]!), 0) > 55) contrast++
      }
      if (contrast > samples * 0.8) {
        right = x - 2
        break
      }
    }
    region.box.width = Math.max(region.box.width, right - region.box.x)
  }
  return regions
}

export async function detectOverlayRegions(
  image: string,
  language: string,
  signal: AbortSignal,
  progress: (s: string) => void,
) {
  imageDataURLSchema.parse(image)
  if (!["eng", "vie", "chi_sim", "jpn"].includes(language))
    throw new Error("Ngôn ngữ OCR không hợp lệ.")
  signal.throwIfAborted()
  if (currentLease) throw new Error("OCR trước đang dừng; chờ một chút rồi thử lại.")
  const lease = {}
  currentLease = lease
  let stopped = false
  const active = () => {
    signal.throwIfAborted()
    if (stopped) throw new DOMException("Đã dừng OCR ảnh.", "AbortError")
  }
  let worker: Worker | undefined,
    bitmap: ImageBitmap | undefined,
    timer: ReturnType<typeof setTimeout> | undefined
  const canvas = document.createElement("canvas")
  let rejectCanceled: (error: Error) => void = () => {}
  const canceled = new Promise<never>((_, reject) => {
    rejectCanceled = reject
  })
  let cleaned = false
  const cleanup = async () => {
    if (cleaned) return
    cleaned = true
    try {
      await worker?.terminate()
    } catch {}
    bitmap?.close()
    canvas.width = canvas.height = 0
    if (currentLease === lease) currentLease = undefined
  }
  const cancel = () => {
    stopped = true
    if (worker) void cleanup()
    rejectCanceled(new DOMException("Đã dừng OCR ảnh.", "AbortError"))
  }
  signal.addEventListener("abort", cancel, { once: true })
  try {
    const work = async () => {
      try {
        const response = await fetch(image)
        bitmap = await createImageBitmap(await response.blob())
        active()
        if (
          bitmap.width * bitmap.height > 8_000_000 ||
          Math.max(bitmap.width, bitmap.height) > 4096
        )
          throw new Error("Ảnh vượt giới hạn OCR.")
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0)
        const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height)
        const { createWorker, OEM, PSM } = await import("tesseract.js")
        active()
        {
          const assets = new URL("ocr-assets/", browser.runtime.getURL("/")).href
          worker = await createWorker(
            language === "eng" ? "eng" : `${language}+eng`,
            OEM.LSTM_ONLY,
            {
              workerPath: assets + "worker.min.js",
              corePath: assets,
              langPath: assets.slice(0, -1),
              workerBlobURL: false,
              cacheMethod: "none",
              gzip: true,
              logger: (event) => {
                if (!signal.aborted && !stopped)
                  progress(`OCR local: ${event.status} · ${Math.round(event.progress * 100)}%`)
              },
              errorHandler: cancel,
            },
          )
        }
        if (signal.aborted || stopped) {
          throw new DOMException("Đã dừng OCR ảnh.", "AbortError")
        }
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SPARSE_TEXT,
          preserve_interword_spaces: "1",
        })
        active()
        const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true })
        active()
        return { width: canvas.width, height: canvas.height, regions: overlayRegions(data, pixels) }
      } finally {
        await cleanup()
      }
    }
    timer = setTimeout(cancel, 120000)
    return await Promise.race([work(), canceled])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", cancel)
  }
}
