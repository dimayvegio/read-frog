import type { PDFDocumentProxy } from "pdfjs-dist"
import type { PdfViewport } from "./viewport"
import { Printer, FilePlus2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { parsePdfPages } from "./extract-pages"
import { loadStudy } from "./study-data"
import { exportAnnotatedPdf } from "./study-export"

export function PdfDocumentActions({
  file,
  pdf,
  viewport,
  title,
}: {
  file: Blob
  pdf: PDFDocumentProxy
  viewport: PdfViewport
  title: string
}) {
  const [panel, setPanel] = useState<"" | "extract" | "print">("")
  const [selection, setSelection] = useState("1-10")
  const [name, setName] = useState(`${title.replace(/\.pdf$/iu, "")}-trich-trang.pdf`)
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("")
  const [printUrl, setPrintUrl] = useState(""),
    [annotations, setAnnotations] = useState(true)
  const worker = useRef<Worker | null>(null),
    epoch = useRef(0),
    frame = useRef<HTMLIFrameElement>(null)
  const urls = useRef(new Set<string>())
  const release = (url: string) => {
    URL.revokeObjectURL(url)
    urls.current.delete(url)
  }
  const cancel = () => {
    ++epoch.current
    worker.current?.terminate()
    worker.current = null
    setBusy(false)
  }
  useEffect(() => {
    const owned = urls.current
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- mutable task owner, not a DOM ref.
    return () => {
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- mutable task epoch, not a DOM ref.
      ++epoch.current
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- mutable worker owner, not a DOM ref.
      worker.current?.terminate()
      for (const url of owned) URL.revokeObjectURL(url)
      owned.clear()
    }
  }, [])
  let preview = ""
  try {
    preview = `${parsePdfPages(selection, pdf.numPages).length} trang · theo thứ tự nhập; bỏ trang trùng.`
  } catch {
    /* Show errors on explicit submit. */
  }
  const extract = async () => {
    cancel()
    const token = epoch.current
    try {
      const pages = parsePdfPages(selection, pdf.numPages)
      setBusy(true)
      setMessage("Đang tạo tài liệu mới trên máy…")
      const bytes = await file.arrayBuffer()
      if (token !== epoch.current) return
      const task = new Worker(new URL("./extract-worker.ts", import.meta.url), { type: "module" })
      worker.current = task
      task.onerror = () => {
        if (token === epoch.current) {
          cancel()
          setMessage("Không tạo được PDF. Thử lại với dải trang ngắn hơn.")
        }
      }
      task.onmessage = (event: MessageEvent<{ bytes?: ArrayBuffer; error?: string }>) => {
        if (token !== epoch.current) return
        task.terminate()
        worker.current = null
        setBusy(false)
        if (event.data.error || !event.data.bytes) {
          setMessage(event.data.error ?? "PDF mới không hợp lệ.")
          return
        }
        const url = URL.createObjectURL(new Blob([event.data.bytes], { type: "application/pdf" }))
        urls.current.add(url)
        const link = document.createElement("a")
        link.href = url
        link.download = name.replace(/[\\/:*?"<>|\p{Cc}]/gu, "-").slice(0, 220) || "trich-trang.pdf"
        if (!link.download.toLowerCase().endsWith(".pdf")) link.download += ".pdf"
        link.click()
        setTimeout(() => release(url), 60000)
        setMessage(
          `Đã tạo PDF mới ${pages.length} trang. File gốc giữ nguyên; bookmark và khung dịch thuộc tài liệu gốc.`,
        )
      }
      task.postMessage({ bytes, selection }, [bytes])
    } catch (error) {
      if (token === epoch.current) {
        setBusy(false)
        setMessage(error instanceof Error ? error.message : "Không tạo được PDF.")
      }
    }
  }
  const preparePrint = async () => {
    cancel()
    const token = epoch.current
    setBusy(true)
    setMessage("Đang chuẩn bị bản in trên máy…")
    try {
      const data = await loadStudy(viewport.workspace.getSnapshot().data.id)
      const blob = annotations
        ? await exportAnnotatedPdf(
            file,
            pdf,
            data.annotations,
            viewport.workspace.getSnapshot().data.styles,
            viewport.textNotes.getSnapshot().data.notes,
          )
        : file
      if (token !== epoch.current) return
      if (printUrl) release(printUrl)
      const url = URL.createObjectURL(blob)
      urls.current.add(url)
      setPrintUrl(url)
      setMessage("Bản in đã sẵn sàng. Bấm In; nếu trình duyệt chặn, mở bản in rồi Ctrl+P.")
    } catch (error) {
      if (token === epoch.current)
        setMessage(error instanceof Error ? error.message : "Chưa chuẩn bị được bản in.")
    } finally {
      if (token === epoch.current) setBusy(false)
    }
  }
  return (
    <div className="rf-document-actions">
      <button
        type="button"
        title="Tạo PDF mới từ các trang đã chọn"
        aria-label="Tạo PDF từ trang"
        onClick={() => {
          cancel()
          setPanel(panel === "extract" ? "" : "extract")
          setMessage("")
        }}
      >
        <FilePlus2 size={16} />
        <span>Trích trang</span>
      </button>
      <button
        type="button"
        title="In PDF"
        aria-label="In PDF"
        onClick={() => {
          cancel()
          setPanel(panel === "print" ? "" : "print")
          setMessage("")
        }}
      >
        <Printer size={16} />
        <span>In</span>
      </button>
      {panel && (
        <section
          className="rf-document-popover"
          aria-label={panel === "extract" ? "Tạo tài liệu mới" : "In tài liệu"}
        >
          <header>
            <strong>{panel === "extract" ? "Tạo tài liệu mới" : "In tài liệu"}</strong>
            <button
              type="button"
              aria-label="Đóng thao tác tài liệu"
              onClick={() => {
                cancel()
                setPanel("")
              }}
            >
              <X size={16} />
            </button>
          </header>
          {panel === "extract" ? (
            <>
              <label>
                Trang / khoảng trang
                <input
                  aria-label="Trang cần trích"
                  value={selection}
                  maxLength={4000}
                  disabled={busy}
                  placeholder="1-10, 30-35, 42"
                  onChange={(e) => setSelection(e.target.value)}
                />
              </label>
              <p>{preview || `Nhập các trang trong 1–${pdf.numPages}. Ví dụ: 1-10, 30-35, 42.`}</p>
              <label>
                Tên PDF mới
                <input
                  aria-label="Tên PDF mới"
                  value={name}
                  maxLength={220}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <p>
                Tạo từ trang gốc, tối đa 2.000 trang/lượt. Xử lý bằng worker trên máy; không gửi
                file lên OpenAI.
              </p>
              <button type="button" disabled={busy} onClick={() => void extract()}>
                Tạo PDF mới
              </button>
            </>
          ) : (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={annotations}
                  onChange={(e) => {
                    setAnnotations(e.target.checked)
                    if (printUrl) {
                      release(printUrl)
                      setPrintUrl("")
                    }
                  }}
                />
                Kèm chú thích và ô chữ
              </label>
              <button type="button" disabled={busy} onClick={() => void preparePrint()}>
                Chuẩn bị bản in
              </button>
              {printUrl && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        frame.current?.contentWindow?.focus()
                        frame.current?.contentWindow?.print()
                      } catch {
                        setMessage("Mở bản in rồi bấm Ctrl+P trong trình xem PDF của trình duyệt.")
                      }
                    }}
                  >
                    In ngay
                  </button>
                  <a href={printUrl} target="_blank" rel="noreferrer">
                    Mở bản in ↗
                  </a>
                  {/* Native local PDF viewer needs same-origin access for print; never loads document scripts. */}
                  {/* oxlint-disable-next-line react/iframe-missing-sandbox -- Chromium PDF plug-in does not render inside a sandboxed frame; fixed local blob only. */}
                  <iframe
                    ref={frame}
                    title="Bản in PDF"
                    src={printUrl}
                    className="rf-print-frame"
                  />
                </>
              )}
            </>
          )}
          {busy && (
            <button
              type="button"
              onClick={() => {
                cancel()
                setMessage("Đã dừng.")
              }}
            >
              Dừng
            </button>
          )}
          <p role="status">{message}</p>
        </section>
      )}
    </div>
  )
}
