import type { PDFDocumentProxy } from "pdfjs-dist"
import type { ImageEditRequest } from "@/utils/image-translation/generated-schema"
import { useEffect, useState } from "react"
import { estimateImageOutput, IMAGE_PRICE_CHECKED } from "@/utils/image-translation/cost-estimate"
import { requestedImageSize } from "@/utils/image-translation/generated-schema"
import { imagePageRasterSize } from "./image-pages"
import { readPageRange } from "./page-range"

const money = (amount: number) => `$${amount.toFixed(5)}`
export function PdfImageCost({
  pdf,
  from,
  to,
  fallback,
  rotation,
  dpi,
  model,
  quality,
  outputSize,
}: {
  pdf: PDFDocumentProxy
  from: string
  to: string
  fallback: number
  rotation: number
  dpi: number
  model: ImageEditRequest["model"]
  quality: ImageEditRequest["quality"]
  outputSize: NonNullable<ImageEditRequest["outputSize"]>
}) {
  const key = JSON.stringify([from, to, fallback, rotation, dpi, model, quality, outputSize])
  const [result, setResult] = useState<{
    key: string
    quote?: { count: number; min: number; max: number; total: number }
    status?: string
  }>()
  const quote = result?.key === key ? result.quote : undefined
  const status =
    outputSize === "auto"
      ? "Chọn 1K / 2K / 4K để ước tính; kích thước Tự động chưa xác định."
      : result?.key === key
        ? result.status
        : "Đang ước tính trên máy…"
  useEffect(() => {
    let stopped = false
    if (outputSize !== "auto")
      void (async () => {
        await Promise.resolve()
        try {
          const range = readPageRange(from, to, pdf.numPages, 20, fallback),
            costs: number[] = []
          for (let n = range.first; n <= range.last; n++) {
            if (stopped) return
            const page = await pdf.getPage(n)
            if (stopped) return
            const v = page.getViewport({
              scale: 1,
              rotation: ((page.rotate ?? 0) + rotation) % 360,
            })
            const source = imagePageRasterSize(v.width, v.height, dpi)
            const [w, h] = requestedImageSize(outputSize, source.width, source.height)
              .split("x")
              .map(Number)
            const estimate = estimateImageOutput(model, quality, w!, h!)
            if (!estimate) throw new Error()
            costs.push(estimate.outputUsd)
          }
          if (!stopped) {
            setResult({
              key,
              quote: {
                count: costs.length,
                min: Math.min(...costs),
                max: Math.max(...costs),
                total: costs.reduce((a, b) => a + b, 0),
              },
            })
          }
        } catch {
          if (!stopped)
            setResult({
              key,
              status: "Nhập dải trang hợp lệ và chọn kích thước phù hợp để ước tính.",
            })
        }
      })()
    return () => {
      stopped = true
    }
  }, [pdf, from, to, fallback, rotation, dpi, model, quality, outputSize, key])
  return (
    <section className="rf-pdf-image-cost" aria-label="Ước tính chi phí ảnh dịch">
      <strong>Ước tính phí ảnh đầu ra · USD</strong>
      {quote ? (
        <>
          <div>
            <span>Mỗi trang</span>
            <b>
              ≈ {money(quote.min)}
              {quote.min !== quote.max ? `–${money(quote.max)}` : ""}
            </b>
          </div>
          <div>
            <span>Tạo mới {quote.count} trang</span>
            <b>≈ {money(quote.total)}</b>
          </div>
        </>
      ) : (
        <p>{status}</p>
      )}
      <p>
        Chưa cộng ảnh đầu vào và prompt; không phải giá trọn gói hay phí thực tế. Ảnh đã xong được
        tái dùng không gọi API.
      </p>
      <details>
        <summary>Cơ sở tính</summary>
        <p>
          Ảnh đầu ra: $30 / 1 triệu token theo calculator OpenAI. Đầu vào tính riêng: ảnh $8, văn
          bản $5 / 1 triệu token; chưa biết số token trước khi gửi. Đối chiếu{" "}
          {IMAGE_PRICE_CHECKED.split("-").reverse().join("/")}, giá có thể thay đổi. Ước tính nếu
          tạo mới toàn bộ dải trang, không gồm thuế.
        </p>
        <a
          href="https://developers.openai.com/api/docs/guides/image-generation#calculating-costs"
          target="_blank"
          rel="noreferrer"
        >
          Calculator OpenAI ↗
        </a>
      </details>
    </section>
  )
}
