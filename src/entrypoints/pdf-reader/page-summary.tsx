import React, { useEffect, useState } from "react"
import { Sparkles, X, Copy, Check, Loader2 } from "lucide-react"
import type { PDFDocumentProxy } from "pdfjs-dist"
import type { Config } from "@/types/config/config"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { aiCacheKey, readAiCache, saveAiCache } from "@/utils/ai-cache/db"
import { streamBackgroundText } from "@/utils/content-script/background-stream-client"
import { i18n } from "@/utils/i18n"
import { resolveProviderRefForCapability } from "@/utils/providers/provider-registry"

interface PdfPageSummaryProps {
  page: number
  pdf: PDFDocumentProxy
  config: Config
  onClose: () => void
}

export function PdfPageSummaryModal({ page, pdf, config, onClose }: PdfPageSummaryProps) {
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    let disposed = false
    setLoading(true)
    setError("")
    setContent("")

    async function runSummary() {
      try {
        const pageProxy = await pdf.getPage(page)
        const textContent = await pageProxy.getTextContent()
        const text = textContent.items
          .map((item: any) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()

        if (disposed) return

        if (!text || text.length < 25) {
          setError(
            i18n.t("pdfReader.pageSummaryTooShort") ||
              "Trang này chưa có lớp chữ văn bản hoặc quá ngắn để tóm tắt. Bạn hãy thử quét OCR trang trước.",
          )
          setLoading(false)
          return
        }

        const cacheKey = aiCacheKey("page-summary", page, text.slice(0, 8000))
        const cached = await readAiCache(cacheKey)
        if (cached) {
          if (!disposed) {
            setContent(cached)
            setLoading(false)
          }
          return
        }

        const provider = resolveProviderRefForCapability(
          "selectionTranslation",
          config.providersConfig,
          config.selectionToolbar.features.translate.providerId,
        )
        if (!provider) {
          throw new Error("Chưa cấu hình OpenAI trong Cài đặt.")
        }

        const isVi = config.language?.targetCode === "vi" || config.uiLanguage === "vi"
        const instructions = isVi
          ? "Bạn là trợ lý học tập và nghiên cứu AI thông minh. Hãy đọc kỹ nội dung trang tài liệu PDF sau và viết tóm tắt súc tích, cấu trúc rõ ràng bằng tiếng Việt:\n- Ý chính cốt lõi\n- Các điểm kỹ thuật, quy định hoặc thông số quan trọng (dùng gạch đầu dòng rõ ràng)\n- Ý nghĩa hoặc ứng dụng thực tế ngắn gọn."
          : "You are a smart AI research assistant. Read the following PDF page content carefully and write a concise, structured summary in English:\n- Core takeaway\n- Key technical specifications, rules, or data points (use clear bullet points)\n- Brief practical significance or application."

        let accumulated = ""
        await streamBackgroundText(
          {
            providerKind: "local",
            providerId: provider.config.id,
            providerConfig: provider.config,
            instructions,
            prompt: `[Nội dung trang ${page}]:\n\n${text.slice(0, 8000)}`,
            usageTask: "pdf",
          },
          {
            signal: controller.signal,
            onChunk: (chunk) => {
              if (chunk.output && !disposed) {
                accumulated = chunk.output
                setContent(chunk.output)
              }
            },
          },
        )
        if (accumulated && !disposed) {
          await saveAiCache(cacheKey, "page-summary", text.slice(0, 8000), accumulated)
        }
      } catch (err: any) {
        if (!disposed && !controller.signal.aborted) {
          setError(err?.message || "Không thể tạo tóm tắt trang lúc này.")
        }
      } finally {
        if (!disposed) setLoading(false)
      }
    }

    void runSummary()
    return () => {
      disposed = true
      controller.abort()
    }
  }, [page, pdf, config])

  const copyToClipboard = () => {
    if (!content) return
    void navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="rf-page-summary-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="rf-page-summary-modal"
        role="dialog"
        aria-modal="true"
        aria-label={i18n.t("pdfReader.pageSummaryModalTitle", [page]) || `Tóm tắt AI · Trang ${page}`}
      >
        <div className="rf-page-summary-header">
          <div className="rf-page-summary-title">
            <Sparkles size={18} className="rf-text-brand" />
            <span>{i18n.t("pdfReader.pageSummaryModalTitle", [page]) || `Tóm tắt AI · Trang ${page}`}</span>
          </div>
          <button
            type="button"
            className="rf-icon-button"
            title="Đóng (Esc)"
            aria-label={i18n.t("pdfReader.quickDictClose") || "Đóng"}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="rf-page-summary-body">
          {loading && !content && (
            <div className="rf-page-summary-loading">
              <Loader2 size={20} className="rf-spin" />
              <span>
                {i18n.t("pdfReader.pageSummaryLoading", [page]) ||
                  `Đang đọc nội dung và phân tích trang ${page} bằng AI…`}
              </span>
            </div>
          )}
          {error && <div className="rf-page-summary-error">{error}</div>}
          {content && (
            <div className="rf-page-summary-content">
              <MarkdownRenderer content={content} />
              {loading && <span className="rf-streaming-dot"> ●</span>}
            </div>
          )}
        </div>

        <div className="rf-page-summary-footer">
          <button
            type="button"
            className="rf-secondary-btn"
            disabled={!content}
            onClick={copyToClipboard}
          >
            {copied ? (
              <>
                <Check size={14} /> {i18n.t("pdfReader.pageSummaryCopied") || "Đã sao chép"}
              </>
            ) : (
              <>
                <Copy size={14} /> {i18n.t("pdfReader.pageSummaryCopy") || "Sao chép tóm tắt"}
              </>
            )}
          </button>
          <button type="button" className="rf-primary-btn" onClick={onClose}>
            {i18n.t("pdfReader.quickDictClose") || "Đóng"}
          </button>
        </div>
      </div>
    </div>
  )
}
