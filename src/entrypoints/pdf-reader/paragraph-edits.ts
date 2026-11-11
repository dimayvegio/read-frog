import type { PdfParagraph } from "./paragraphs"
import { sha256 } from "js-sha256"
export const paragraphSource = (items: PdfParagraph[]) =>
  sha256(JSON.stringify(items.map((p) => [p.id, p.text])))
const reindex = (items: PdfParagraph[]) => items.map((p, index) => ({ ...p, index }))
export function mergeParagraphs(items: PdfParagraph[], id: string) {
  const at = items.findIndex((p) => p.id === id),
    a = items[at],
    b = items[at + 1]
  if (
    !a ||
    !b ||
    a.page !== b.page ||
    a.excluded ||
    b.excluded ||
    a.text.length + b.text.length + 1 > 20000
  )
    throw new Error("Chỉ gộp hai đoạn liền nhau còn được dịch, tối đa 20.000 ký tự.")
  const text = `${a.text}\n${b.text}`,
    x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y)
  const merged = {
    ...a,
    id: `${a.page}-edit-${sha256(JSON.stringify([a.id, b.id, text])).slice(0, 24)}`,
    text,
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
  return reindex([...items.slice(0, at), merged, ...items.slice(at + 2)])
}
export function splitParagraph(items: PdfParagraph[], id: string, offset: number) {
  const at = items.findIndex((p) => p.id === id),
    p = items[at]
  if (!p || p.excluded || items.length >= 120)
    throw new Error("Không tách được đoạn này hoặc đã đủ 120 đoạn/trang.")
  if (!Number.isInteger(offset) || offset <= 0 || offset >= p.text.length)
    throw new Error("Đặt con trỏ giữa đoạn để tách thành hai phần có chữ.")
  const boundary =
    [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(p.text)].findLast(
      (s) => s.index <= offset,
    )?.index ?? 0
  const left = p.text.slice(0, boundary).trim(),
    right = p.text.slice(boundary).trim()
  if (!left || !right) throw new Error("Đặt con trỏ giữa đoạn để tách thành hai phần có chữ.")
  const ratio = Math.max(0.05, Math.min(0.95, boundary / p.text.length))
  const parts = [left, right].map((text, index) => ({
    ...p,
    text,
    id: `${p.page}-edit-${sha256(JSON.stringify([p.id, text, index])).slice(0, 24)}`,
    y: index ? p.y + p.height * ratio : p.y,
    height: p.height * (index ? 1 - ratio : ratio),
  }))
  return reindex([...items.slice(0, at), ...parts, ...items.slice(at + 1)])
}
