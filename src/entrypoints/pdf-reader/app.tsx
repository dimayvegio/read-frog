import type { PDFDocumentLoadingTask } from "pdfjs-dist"
import type { Config } from "@/types/config/config"
import type { NativeSelectionRequest } from "@/types/native-selection"
import type { PdfReaderSource } from "@/utils/selection-result/reading-position"
import { sha256 } from "js-sha256"
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist"
// oxlint-disable-next-line import/default -- Vite's ?url asset import has a generated default export.
import workerURL from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { useEffect, useRef, useState } from "react"
import { browser } from "#imports"
import { MAX_NATIVE_SELECTION_LENGTH } from "@/types/native-selection"
import { sendMessage } from "@/utils/message"
import { DEFAULT_PDF_TEXT_OPTIONS } from "@/utils/selection-result/pdf-text"
import { SelectionTranslation } from "../selection-result/app"
import { PdfAutosave } from "./autosave"
import { PdfViewport, type ViewPosition } from "./viewport"

GlobalWorkerOptions.workerSrc = workerURL
const MAX_BYTES = 200 * 1024 * 1024
const titleFor = (name: string) => name.replace(/\p{Cc}/gu, " ").slice(0, 240) || "PDF"
export function PdfReader({ config }: { config: Config }) {
  const host = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null)
  const current = useRef<{
    task: PDFDocumentLoadingTask
    viewport?: PdfViewport
    saver?: PdfAutosave
  } | null>(null)
  const version = useRef(0)
  const [documentInfo, setDocumentInfo] = useState<{
    id: string
    historyId: string
    title: string
    count: number
  } | null>(null)
  const [view, setView] = useState<ViewPosition>({ page: 1, offset: 0, zoom: "fit-width" })
  const [loading, setLoading] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("")
  const [selection, setSelection] = useState("")
  const [selectionPage, setSelectionPage] = useState(1)
  const [shotBusy, setShotBusy] = useState(false)
  const [request, setRequest] = useState<NativeSelectionRequest | null>(null)
  const [textOptions, setTextOptions] = useState(DEFAULT_PDF_TEXT_OPTIONS)
  const dispose = () => {
    current.current?.saver?.stop()
    current.current?.viewport?.destroy()
    void current.current?.task.destroy()
    current.current = null
  }
  useEffect(() => {
    let stopped = false
    let remove: (() => void) | undefined
    void browser.tabs
      .getCurrent()
      .then((tab) => {
        if (stopped || !documentInfo || tab?.id === undefined) return
        // A non-target reader must not reply: runtime messaging broadcasts to
        // extension pages and the first reply wins. Keep this listener raw.
        const listener: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (
          message,
          sender,
          reply,
        ) => {
          if (
            sender.id !== browser.runtime.id ||
            message?.type !== "goToPdfVocabularySource" ||
            message.data?.targetTabId !== tab.id ||
            message.data.documentId !== documentInfo.id ||
            !Number.isInteger(message.data.page) ||
            message.data.page < 1 ||
            message.data.page > documentInfo.count
          )
            return false
          current.current?.viewport?.navigate(message.data.page)
          reply({ res: true })
          return false
        }
        browser.runtime.onMessage.addListener(listener)
        remove = () => browser.runtime.onMessage.removeListener(listener)
      })
      .catch(() => {})
    return () => {
      stopped = true
      remove?.()
    }
  }, [documentInfo])
  const load = async (file: Blob, name: string, source?: PdfReaderSource) => {
    const token = ++version.current
    dispose()
    setLoading(true)
    setError("")
    setSelection("")
    setRequest(null)
    setDocumentInfo(null)
    try {
      if (file.size > MAX_BYTES) throw new Error("Trình đọc hiện hỗ trợ file tối đa 200 MiB.")
      const bytes = new Uint8Array(await file.arrayBuffer())
      const id = sha256(bytes)
      const saved = await sendMessage("loadPdfReadingPosition", { documentId: id })
      if (token !== version.current) return
      const task = getDocument({
        data: bytes,
        cMapUrl: new URL("pdf-assets/cmaps/", browser.runtime.getURL("/")).href,
        cMapPacked: true,
        standardFontDataUrl: new URL("pdf-assets/standard_fonts/", browser.runtime.getURL("/"))
          .href,
        wasmUrl: new URL("pdf-assets/wasm/", browser.runtime.getURL("/")).href,
        iccUrl: new URL("pdf-assets/iccs/", browser.runtime.getURL("/")).href,
      })
      current.current = { task }
      task.onPassword = (submit: (password: string) => void, reason: number) => {
        if (token !== version.current) return
        const password = window.prompt(
          reason === 2
            ? "Mật khẩu chưa đúng. Nhập lại mật khẩu PDF:"
            : "Nhập mật khẩu PDF (không lưu lại):",
        )
        if (password === null) {
          void task.destroy()
          setError("Đã hủy mở PDF có mật khẩu.")
          setLoading(false)
        } else submit(password)
      }
      const pdf = await task.promise
      if (token !== version.current) return
      if (pdf.numPages > 20000) throw new Error("Trình đọc hiện hỗ trợ tối đa 20.000 trang.")
      const title = titleFor(name),
        historyId = saved.position?.historyDocumentId ?? source?.document.id ?? id
      const metadata = {
        documentId: id,
        historyDocumentId: historyId,
        title,
        pageCount: pdf.numPages,
      }
      const saver = new PdfAutosave(saved.epoch, (text) => {
        if (token === version.current) setStatus(text)
      })
      const viewport = new PdfViewport(
        host.current!,
        pdf,
        (position, activity) => {
          if (token !== version.current) return
          setView((previous) =>
            previous.page === position.page && previous.zoom === position.zoom
              ? previous
              : position,
          )
          if (activity) current.current?.saver?.record({ ...metadata, ...position })
        },
        (text) => {
          if (token === version.current) setError(text)
        },
      )
      current.current = { task, viewport, saver }
      await viewport.init(saved.position ?? undefined)
      if (token !== version.current) return
      setDocumentInfo({ id, historyId, title, count: pdf.numPages })
      setStatus(
        saved.position
          ? `Đã khôi phục vị trí đọc — trang ${saved.position.page}. Tự lưu khi bạn đọc tiếp.`
          : "Tự lưu vị trí khi bạn cuộn hoặc chuyển trang.",
      )
    } catch (cause) {
      if (token === version.current) {
        dispose()
        setError(cause instanceof Error ? cause.message : "Không mở được PDF. Hãy chọn lại file.")
      }
    } finally {
      if (token === version.current) setLoading(false)
    }
  }
  useEffect(() => {
    const channel = new URLSearchParams(location.search).get("file")
    const token = version.current
    if (channel)
      void (async () => {
        try {
          const source = await sendMessage("getPdfReaderSource", { channel })
          if (!source) throw new Error("Phiên mở file đã hết hạn. Hãy chọn lại PDF trên máy.")
          const response = await fetch(source.url)
          if (!response.ok) throw new Error("Không đọc được file")
          const blob = await response.blob()
          if (version.current === token) await load(blob, source.document.title, source)
        } catch {
          if (version.current === token)
            setError(
              "Hãy chọn file PDF bên dưới. Để mở thẳng từ tab PDF, bật Allow access to file URLs trong phần quản lý extension.",
            )
        }
      })()
    const flush = () => current.current?.saver?.flush()
    const visibility = () => {
      if (document.visibilityState === "hidden") flush()
    }
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", visibility)
    return () => {
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- invalidate asynchronous loads; this ref is not a DOM node.
      ++version.current
      dispose()
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", visibility)
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- startup source is immutable; file picker starts subsequent loads explicitly.
  }, [])
  return (
    <main className="rf-reader">
      <header className="rf-reader-toolbar">
        <strong>Read Frog · PDF</strong>
        <button type="button" onClick={() => input.current?.click()}>
          Mở PDF trên máy
        </button>
        <input
          ref={input}
          type="file"
          accept=".pdf,application/pdf"
          hidden
          aria-label="Chọn PDF"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (file) void load(file, file.name)
          }}
        />
        {documentInfo && (
          <>
            <button
              type="button"
              disabled={shotBusy}
              onClick={async () => {
                const active = current.current,
                  token = version.current
                if (!active?.viewport) return
                setShotBusy(true)
                try {
                  const image = await active.viewport.captureVisible()
                  if (token === version.current)
                    await sendMessage("openImageTranslation", { image })
                } catch (cause) {
                  if (token === version.current)
                    setError(cause instanceof Error ? cause.message : "Chưa chụp được vùng PDF.")
                } finally {
                  setShotBusy(false)
                }
              }}
            >
              {shotBusy ? "Đang chụp…" : "Chụp vùng & dịch ảnh"}
            </button>
            <span className="rf-reader-name" title={documentInfo.title}>
              {documentInfo.title}
            </span>
            <button
              type="button"
              aria-label="Trang trước"
              disabled={view.page <= 1}
              onClick={() => current.current?.viewport?.navigate(view.page - 1)}
            >
              ←
            </button>
            <label>
              Trang{" "}
              <input
                key={view.page}
                aria-label="Số trang"
                type="number"
                min="1"
                max={documentInfo.count}
                defaultValue={view.page}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    const value = Number(event.currentTarget.value)
                    if (Number.isInteger(value)) current.current?.viewport?.navigate(value)
                  }
                }}
                onBlur={(event) => {
                  const value = Number(event.currentTarget.value)
                  if (Number.isInteger(value)) current.current?.viewport?.navigate(value)
                }}
              />{" "}
              / {documentInfo.count}
            </label>
            <button
              type="button"
              aria-label="Trang sau"
              disabled={view.page >= documentInfo.count}
              onClick={() => current.current?.viewport?.navigate(view.page + 1)}
            >
              →
            </button>
            <select
              aria-label="Thu phóng"
              value={view.zoom}
              onChange={(event) =>
                current.current?.viewport?.setZoom(
                  event.target.value === "fit-width" ? "fit-width" : Number(event.target.value),
                )
              }
            >
              <option value="fit-width">Vừa chiều rộng</option>
              {[0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n * 100}%
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={async () => {
                const token = version.current,
                  active = current.current
                if (!active) return
                active.saver?.stop()
                try {
                  const epoch = await sendMessage("forgetPdfReadingPosition", {
                    documentId: documentInfo.id,
                  })
                  if (token !== version.current) return
                  active.viewport?.reset()
                  active.saver = new PdfAutosave(epoch, setStatus)
                  setStatus("Đã quên vị trí. Tự lưu lại khi bạn cuộn hoặc chuyển trang.")
                } catch {
                  setError("Chưa xóa được vị trí. Mở lại file để tiếp tục tự lưu.")
                }
              }}
            >
              Quên vị trí
            </button>
          </>
        )}
      </header>
      <p className="rf-reader-status" role="status">
        {loading ? "Đang mở PDF trên máy…" : status}
      </p>
      {error && (
        <p className="rf-reader-error" role="alert">
          {error}
        </p>
      )}
      {!documentInfo && !loading && (
        <p className="rf-reader-empty">
          Chọn file PDF để đọc và tự nhớ trang, vị trí cuộn, thu phóng. Lần sau mở lại cùng file, kể
          cả đổi tên, sẽ trở về chỗ đang đọc. PDF không được sao chép vào bộ nhớ extension. Bạn cần
          chọn lại file nếu mở một phiên mới. Chức năng tự lưu hoạt động trong trình đọc Read Frog
          này.
        </p>
      )}
      <div className="rf-reader-body">
        <div
          ref={host}
          className="rf-pdf-scroll"
          aria-label="Nội dung PDF"
          tabIndex={0}
          onMouseUp={() => {
            const selected = window.getSelection()
            setSelectionPage(
              Number(
                selected?.anchorNode?.parentElement?.closest<HTMLElement>(".rf-pdf-page")?.dataset
                  .page,
              ) || view.page,
            )
            setSelection(
              selected?.anchorNode &&
                host.current?.contains(selected.anchorNode) &&
                selected.focusNode &&
                host.current.contains(selected.focusNode)
                ? selected.toString().trim()
                : "",
            )
          }}
          onKeyUp={() => {
            const selected = window.getSelection()
            setSelectionPage(
              Number(
                selected?.anchorNode?.parentElement?.closest<HTMLElement>(".rf-pdf-page")?.dataset
                  .page,
              ) || view.page,
            )
            if (selected?.anchorNode && host.current?.contains(selected.anchorNode))
              setSelection(selected.toString().trim())
          }}
        />
        {request && (
          <aside className="rf-reader-translation">
            <button type="button" onClick={() => setRequest(null)}>
              Đóng khung dịch ×
            </button>
            <SelectionTranslation
              key={request.id}
              request={request}
              config={config}
              panel
              embedded
              textOptions={textOptions}
              onTextOptions={setTextOptions}
            />
          </aside>
        )}
      </div>
      {selection && documentInfo && (
        <button
          type="button"
          className="rf-reader-action"
          onClick={() => {
            setRequest({
              id: crypto.randomUUID(),
              text: selection.length > MAX_NATIVE_SELECTION_LENGTH ? "" : selection,
              tooLong: selection.length > MAX_NATIVE_SELECTION_LENGTH,
              createdAt: Date.now(),
              document: { id: documentInfo.historyId, title: documentInfo.title },
              source: {
                kind: "pdf",
                documentId: documentInfo.id,
                page: selectionPage,
              },
            })
            setSelection("")
          }}
        >
          Dịch đoạn đã chọn
        </button>
      )}
    </main>
  )
}
