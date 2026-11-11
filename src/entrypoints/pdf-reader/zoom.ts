export const MIN_PDF_ZOOM = 0.1
export const MAX_PDF_ZOOM = 4
export const boundPdfZoom = (value: number) => Math.max(MIN_PDF_ZOOM, Math.min(MAX_PDF_ZOOM, value))
export function parsePdfZoom(value: string) {
  const text = value.trim().replace(/%$/u, "").trim().replace(",", ".")
  if (!/^\d{1,3}(?:\.\d{1,2})?$/u.test(text)) return null
  const percent = Number(text)
  return percent >= 10 && percent <= 400 ? percent / 100 : null
}
export const stepPdfZoom = (value: number, direction: number) =>
  boundPdfZoom(Math.round((value + direction * 0.1) * 100) / 100)
