import { imageDataURLSchema, MAX_IMAGE_DATA_URL } from "@/types/image-translation"
export interface Point {
  x: number
  y: number
}
export interface Crop {
  x: number
  y: number
  width: number
  height: number
}
const clamp = (n: number) => Math.max(0, Math.min(1, n))
export function cropBetween(a: Point, b: Point): Crop {
  const left = Math.min(clamp(a.x), clamp(b.x)),
    top = Math.min(clamp(a.y), clamp(b.y))
  return {
    x: left,
    y: top,
    width: Math.max(clamp(a.x), clamp(b.x)) - left,
    height: Math.max(clamp(a.y), clamp(b.y)) - top,
  }
}
export function cropPixels(crop: Crop, width: number, height: number) {
  const x = Math.floor(clamp(crop.x) * width),
    y = Math.floor(clamp(crop.y) * height)
  return {
    x,
    y,
    width: Math.min(width - x, Math.ceil(clamp(crop.width) * width)),
    height: Math.min(height - y, Math.ceil(clamp(crop.height) * height)),
  }
}
export async function decodeImage(file: Blob) {
  if (file.size > 20 * 1024 * 1024) throw new Error("Ảnh tối đa 20 MiB. Hãy chọn một vùng nhỏ hơn.")
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const supported =
    (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) ||
    (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP")
  if (!supported) throw new Error("Chỉ hỗ trợ PNG, JPEG hoặc WebP.")
  return createImageBitmap(file)
}
export function encodeCrop(source: CanvasImageSource, width: number, height: number, crop: Crop) {
  const box = cropPixels(crop, width, height)
  if (box.width < 8 || box.height < 8)
    throw new Error("Vùng chọn quá nhỏ. Hãy kéo một vùng lớn hơn.")
  const ratio = Math.min(
    1,
    4096 / Math.max(box.width, box.height),
    Math.sqrt(8_000_000 / (box.width * box.height)),
  )
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(box.width * ratio))
  canvas.height = Math.max(1, Math.round(box.height * ratio))
  const context = canvas.getContext("2d")!
  context.fillStyle = "white"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, canvas.width, canvas.height)
  let image = canvas.toDataURL("image/png")
  if (image.length > MAX_IMAGE_DATA_URL) image = canvas.toDataURL("image/jpeg", 0.92)
  return imageDataURLSchema.parse(image)
}
