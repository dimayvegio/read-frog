import { z } from "zod"

export const IMAGE_OVERLAY_ID = "image-overlay-v1"
export interface PixelBox {
  x: number
  y: number
  width: number
  height: number
}
export interface OverlayRegion {
  id: string
  source: string
  translation: string
  readText?: string
  box: PixelBox
  ink: PixelBox[]
  enabled: boolean
  font: "sans-serif" | "serif" | "monospace"
  size: number
  color: string
  background: string | null
  bold: boolean
  italic: boolean
}
export interface OverlayImage {
  image: string
  width: number
  height: number
  regions: OverlayRegion[]
}
export const overlayReplySchema = z.strictObject({
  regions: z
    .array(
      z.strictObject({
        id: z.string().max(32),
        original: z.string().max(4000),
        translation: z.string().max(8000),
      }),
    )
    .max(256),
})
export function decodeOverlayReply(raw: string, regions: OverlayRegion[]) {
  if (raw.length > 60000) throw new Error("Bản dịch trên ảnh quá dài.")
  let reply: z.infer<typeof overlayReplySchema>
  try {
    reply = overlayReplySchema.parse(JSON.parse(raw))
  } catch {
    throw new Error(
      "Kết quả vùng chữ chưa đúng định dạng. Hãy chủ động đọc lại; không tự gửi lại ảnh.",
    )
  }
  const expected = regions.filter((r) => r.enabled && r.source.trim())
  const byId = new Map(reply.regions.map((r) => [r.id, r]))
  if (
    reply.regions.length !== expected.length ||
    byId.size !== expected.length ||
    expected.some((r) => !byId.get(r.id)?.translation.trim() || !byId.get(r.id)?.original.trim())
  )
    throw new Error(
      "Bản dịch thiếu/trùng vùng chữ; chưa vẽ hoặc lưu kết quả. Hãy chủ động thử lại.",
    )
  if (reply.regions.reduce((n, r) => n + r.original.length, 0) > 20000)
    throw new Error("Chữ nhận dạng quá dài; hãy chọn vùng nhỏ hơn.")
  return regions.map((r) => {
    const result = byId.get(r.id)
    return result ? { ...r, readText: result.original, translation: result.translation } : r
  })
}
export function clampBox(box: PixelBox, width: number, height: number): PixelBox {
  if (!Object.values(box).every(Number.isFinite)) throw new Error("Tọa độ vùng không hợp lệ.")
  const w = Math.max(4, Math.min(width, box.width)),
    h = Math.max(4, Math.min(height, box.height))
  return {
    x: Math.max(0, Math.min(width - w, box.x)),
    y: Math.max(0, Math.min(height - h, box.y)),
    width: w,
    height: h,
  }
}
export function sampleColors(pixels: ImageData, box: PixelBox) {
  const at = (x: number, y: number) => {
    const i =
      (Math.max(0, Math.min(pixels.height - 1, y)) * pixels.width +
        Math.max(0, Math.min(pixels.width - 1, x))) *
      4
    return [pixels.data[i]!, pixels.data[i + 1]!, pixels.data[i + 2]!]
  }
  const x0 = Math.max(0, Math.floor(box.x) - 2),
    y0 = Math.max(0, Math.floor(box.y) - 2)
  const x1 = Math.min(pixels.width - 1, Math.ceil(box.x + box.width) + 2),
    y1 = Math.min(pixels.height - 1, Math.ceil(box.y + box.height) + 2)
  let alphaCount = 0,
    edgeCount = 0
  const alpha = (x: number, y: number) => {
    edgeCount++
    if (pixels.data[(y * pixels.width + x) * 4 + 3]! < 64) alphaCount++
  }
  const histogram = new Map<string, { count: number; rgb: number[] }>()
  const add = (rgb: number[]) => {
    const key = rgb.map((v) => v >> 4).join(",")
    const existing = histogram.get(key)
    if (existing) existing.count++
    else histogram.set(key, { count: 1, rgb })
  }
  for (let x = x0; x <= x1; x++) {
    alpha(x, y0)
    alpha(x, y1)
    add(at(x, y0))
    add(at(x, y1))
  }
  for (let y = y0; y <= y1; y++) {
    alpha(x0, y)
    alpha(x1, y)
    add(at(x0, y))
    add(at(x1, y))
  }
  const bg = [...histogram.values()].sort((a, b) => b.count - a.count)[0]?.rgb ?? [255, 255, 255]
  histogram.clear()
  for (
    let y = Math.max(0, Math.floor(box.y));
    y < Math.min(pixels.height, box.y + box.height);
    y += 2
  )
    for (
      let x = Math.max(0, Math.floor(box.x));
      x < Math.min(pixels.width, box.x + box.width);
      x += 2
    ) {
      const rgb = at(x, y)
      if (
        pixels.data[(y * pixels.width + x) * 4 + 3]! > 80 &&
        (alphaCount > edgeCount * 0.8 || rgb.reduce((n, v, i) => n + Math.abs(v - bg[i]!), 0) > 110)
      )
        add(rgb)
    }
  const candidates = [...histogram.values()]
  const peak = Math.max(0, ...candidates.map((c) => c.count))
  const contrast = (rgb: number[]) => rgb.reduce((n, c, i) => n + Math.abs(c - bg[i]!), 0)
  const fg = candidates
    .filter((c) => c.count >= Math.max(2, peak * 0.05))
    .sort((a, b) => contrast(b.rgb) - contrast(a.rgb) || b.count - a.count)[0]?.rgb ?? [20, 20, 20]
  const hex = (rgb: number[]) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("")
  return { background: hex(bg), color: hex(fg), transparent: alphaCount > edgeCount * 0.8 }
}

const family = {
  "sans-serif": "Arial, sans-serif",
  serif: "Georgia, serif",
  monospace: "monospace",
}
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = []
  for (const paragraph of text.replace(/\r\n?/gu, "\n").split("\n")) {
    let line = ""
    for (const word of paragraph.split(/\s+/u)) {
      const next = line ? `${line} ${word}` : word
      if (ctx.measureText(next).width <= width) {
        line = next
        continue
      }
      if (line) lines.push(line)
      line = ""
      for (const character of word) {
        if (line && ctx.measureText(line + character).width > width) {
          lines.push(line)
          line = ""
        }
        line += character
      }
    }
    lines.push(line)
  }
  return lines
}
export function fitOverlayText(ctx: CanvasRenderingContext2D, region: OverlayRegion) {
  let low = 6,
    high = Math.max(6, Math.min(180, region.size))
  for (let attempt = 0; attempt < 10; attempt++) {
    const size = Math.floor((low + high) * 2) / 4
    ctx.font = `${region.italic ? "italic " : ""}${region.bold ? "bold " : ""}${size}px ${family[region.font]}`
    const lines = wrap(ctx, region.translation, Math.max(1, region.box.width - 2))
    if (lines.length * size * 1.18 <= region.box.height) low = size
    else high = size
  }
  const size = low
  ctx.font = `${region.italic ? "italic " : ""}${region.bold ? "bold " : ""}${size}px ${family[region.font]}`
  const lines = wrap(ctx, region.translation, Math.max(1, region.box.width - 2))
  const overflow = lines.length * size * 1.18 > region.box.height
  return { size, lines, overflow }
}
/** Pixels outside the original word masks and destination boxes are never repainted. */
export function paintOverlay(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  width: number,
  height: number,
  regions: OverlayRegion[],
) {
  if (width * height > 8_000_000 || width > 4096 || height > 4096)
    throw new Error("Ảnh vượt giới hạn vẽ.")
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  const ctx = canvas.getContext("2d")!
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)
  const pixels = ctx.getImageData(0, 0, width, height)
  const active = regions.filter(
    (r) =>
      r.enabled && r.translation.trim() && r.translation.trim() !== (r.readText ?? r.source).trim(),
  )
  // Remove old letters inside measured OCR word boxes, never the entire paragraph/table cell.
  for (const region of active)
    for (const word of region.ink) {
      const sampled = sampleColors(pixels, word)
      ctx.fillStyle = region.background ?? sampled.background
      const rect = [
        Math.max(0, word.x - 1),
        Math.max(0, word.y - 1),
        Math.min(width - word.x + 1, word.width + 2),
        Math.min(height - word.y + 1, word.height + 2),
      ] as const
      if (sampled.transparent && !region.background) ctx.clearRect(...rect)
      else ctx.fillRect(...rect)
    }
  const warnings: string[] = []
  for (const region of active) {
    ctx.save()
    const box = clampBox(region.box, width, height)
    ctx.beginPath()
    ctx.rect(box.x, box.y, box.width, box.height)
    ctx.clip()
    const fitted = fitOverlayText(ctx, region)
    if (fitted.overflow || fitted.size < 10) warnings.push(region.id)
    ctx.fillStyle = region.color
    ctx.textBaseline = "top"
    for (const [index, line] of fitted.lines.entries())
      ctx.fillText(line, box.x + 1, box.y + index * fitted.size * 1.18)
    ctx.restore()
  }
  return warnings
}
