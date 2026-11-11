import type { PDFDocumentProxy } from "pdfjs-dist"
import type { PdfBilingualSession } from "./bilingual-session"
import type { PdfViewport } from "./viewport"
import { useEffect, useRef, useState } from "react"
import { extractBatchParagraphs } from "./batch-paragraphs"
import { PdfPageRange, readPageRange } from "./page-range"
export function PdfBatchTranslation({
  pdf,
  viewport,
  createSession,
  onBusy,
  onComplete,
  configured,
}: {
  pdf: PDFDocumentProxy
  viewport: PdfViewport
  createSession: () => PdfBilingualSession
  onBusy: (value: boolean) => void
  onComplete: () => void
  configured: boolean
}) {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("")
  const job = useRef<{ controller: AbortController; session: PdfBilingualSession } | null>(null)
  useEffect(
    () => () => {
      const active = job.current
      job.current = null
      active?.controller.abort()
      active?.session.destroy()
    },
    [],
  )
  const run = async () => {
    if (job.current) return
    let range: { first: number; last: number }
    try {
      range = readPageRange(from, to, pdf.numPages, 100, viewport.snapshot().page)
    } catch (error) {
      setMessage(String(error))
      return
    }
    const controller = new AbortController(),
      session = createSession(),
      active = { controller, session },
      layouts = viewport.workspace.getSnapshot().data.layouts
    job.current = active
    setBusy(true)
    onBusy(true)
    const abort = () => session.cancel()
    controller.signal.addEventListener("abort", abort)
    const unsubscribe = viewport.workspace.subscribe(() => {
      if (viewport.workspace.getSnapshot().data.layouts !== layouts) controller.abort()
    })
    let done = 0,
      skipped = 0
    try {
      for (let number = range.first; number <= range.last; number++) {
        controller.signal.throwIfAborted()
        setMessage(`Đang đọc trang ${number} · ${done}/${range.last - range.first + 1} trang`)
        let source
        try {
          source = await extractBatchParagraphs(pdf, viewport, number, controller.signal)
        } catch (error) {
          controller.signal.throwIfAborted()
          setMessage(String(error))
          throw error
        }
        controller.signal.throwIfAborted()
        if (!source.paragraphs.some((p) => !p.excluded)) {
          skipped++
          done++
          continue
        }
        session.setPage(number, source.paragraphs)
        await session.restoreCache()
        controller.signal.throwIfAborted()
        await session.translatePage()
        controller.signal.throwIfAborted()
        if (
          source.paragraphs.some(
            (p) => !p.excluded && session.getSnapshot().rows[p.id]?.status !== "done",
          )
        )
          throw new Error(session.getSnapshot().message || `Đã dừng tại trang ${number}.`)
        done++
        setMessage(`Đã dịch ${done}/${range.last - range.first + 1} trang · Trang ${number}`)
      }
      setMessage(
        `Hoàn tất ${done} trang${skipped ? `; bỏ qua ${skipped} trang không có chữ/phần được dịch` : ""}. Bản dịch lưu trong cache của từng trang.`,
      )
      onComplete()
    } catch (error) {
      if (job.current === active)
        setMessage(
          controller.signal.aborted
            ? `Đã dừng sau ${done} trang. Các trang xong vẫn giữ cache.`
            : error instanceof Error
              ? error.message
              : "Không xử lý được dải trang.",
        )
    } finally {
      unsubscribe()
      controller.signal.removeEventListener("abort", abort)
      session.destroy()
      if (job.current === active) {
        job.current = null
        setBusy(false)
        onBusy(false)
      }
    }
  }
  return (
    <details className="rf-batch-translation">
      <summary>Dịch dải trang</summary>
      <PdfPageRange
        prefix="Dịch song ngữ"
        from={from}
        to={to}
        onFrom={setFrom}
        onTo={setTo}
        total={pdf.numPages}
        disabled={busy}
      />
      <p>
        Để trống để dịch trang đang xem. Tối đa 100 trang/lượt, xử lý lần lượt và dùng lại cache.
        OpenAI có tính phí; trang scan cần OCR trước.
      </p>
      <button type="button" disabled={busy || !configured} onClick={() => void run()}>
        Dịch dải trang đã chọn
      </button>
      {busy && (
        <button type="button" onClick={() => job.current?.controller.abort()}>
          Dừng dải trang
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  )
}
