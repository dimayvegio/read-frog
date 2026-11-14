import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist"
import type { Config } from "@/types/config/config"
import type { NativeSelectionRequest } from "@/types/native-selection"
import type { PdfReaderSource } from "@/utils/selection-result/reading-position"
import { sha256 } from "js-sha256"
import { BookOpen, FolderOpen, Languages, ScanLine, FileText } from "lucide-react"
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist"
// oxlint-disable-next-line import/default -- Vite's ?url asset import has a generated default export.
import workerURL from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { useEffect, useRef, useState } from "react"
import { browser } from "#imports"
import { MAX_NATIVE_SELECTION_LENGTH } from "@/types/native-selection"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
import { listPdfHistory } from "@/utils/selection-result/pdf-history"
import { DEFAULT_PDF_TEXT_OPTIONS } from "@/utils/selection-result/pdf-text"
import { loadLibrary } from "@/utils/vocabulary/db"
import { SelectionTranslation } from "../selection-result/app"
import { PdfAutosave } from "./autosave"
import { PdfBilingualPane, type PdfBilingualHandle } from "./bilingual-pane"
import { PdfDocumentActions } from "./document-actions"
import { mergeHighlightBoxes } from "./highlight-boxes"
import { HorizontalPositionBar } from "./horizontal-position-bar"
import { canonicalLayer, pageBox } from "./page-geometry"
import { PdfPageSummaryModal } from "./page-summary"
import { QuickDictionaryPopover, type QuickWordTarget } from "./quick-dictionary"
import { PdfReaderNavigation } from "./reader-navigation"
import { pdfPicker, rememberPdf } from "./recent-files"
import { RecentFilesMenu } from "./recent-files-menu"
import { usePdfSplitter } from "./splitter"
import { loadStudy } from "./study-data"
import { exportStudySummaryFile } from "./study-summary-export"
import { PdfStudyTools } from "./study-tools"
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
    viewport: PdfViewport
    id: string
    historyId: string
    title: string
    count: number
    pdf: PDFDocumentProxy
    file: Blob
  } | null>(null)
  const [view, setView] = useState<ViewPosition>({ page: 1, offset: 0, zoom: "fit-width" })
  const [loading, setLoading] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("")
  const [selection, setSelection] = useState("")
  const [selectionPage, setSelectionPage] = useState(1)
  const [shotBusy, setShotBusy] = useState(false)
  const [request, setRequest] = useState<NativeSelectionRequest | null>(null)
  const [activeHighlight, setActiveHighlight] = useState<Record<
    number,
    Array<{ x: number; y: number; width: number; height: number }>
  > | null>(null)
  const [textOptions, setTextOptions] = useState(DEFAULT_PDF_TEXT_OPTIONS)
  const [bilingual, setBilingual] = useState(false),
    [bilingualBusy, setBilingualBusy] = useState(false)
  const [panX, setPanX] = useState(0)
  const originalColumnRef = useRef<HTMLDivElement>(null)
  const [quickWord, setQuickWord] = useState<QuickWordTarget | null>(null)
  const [summaryModalPage, setSummaryModalPage] = useState<number | null>(null)
  const [activeStudyPanel, setActiveStudyPanel] = useState("")
  const [bilingualWidth, setBilingualWidth] = useState(() => {
    try {
      const saved = localStorage.getItem("rf-bilingual-width")
      return saved && Number.isFinite(Number(saved))
        ? Math.min(75, Math.max(25, Number(saved)))
        : 48
    } catch {
      return 48
    }
  })
  const [translationWidth, setTranslationWidth] = useState(() => {
    try {
      const saved = localStorage.getItem("rf-translation-width")
      return saved && Number.isFinite(Number(saved))
        ? Math.min(800, Math.max(260, Number(saved)))
        : 390
    } catch {
      return 390
    }
  })

  const onTranslationSplitterDown = usePdfSplitter(
    "pixels",
    setTranslationWidth,
    "rf-translation-width",
  )
  const onSplitterDown = usePdfSplitter("percent", setBilingualWidth, "rf-bilingual-width")

  const bilingualPane = useRef<PdfBilingualHandle>(null)
  const dispose = () => {
    current.current?.saver?.stop()
    current.current?.viewport?.destroy()
    void current.current?.task.destroy()
    current.current = null
    setActiveHighlight(null)
    document.title = "Đọc PDF | FlowRead"
  }

  useEffect(() => {
    let stopped = false
    let remove: (() => void) | undefined
    void browser.tabs
      .getCurrent()
      .then((tab) => {
        if (stopped || !documentInfo || tab?.id === undefined) return
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

  const load = async (
    file: Blob,
    name: string,
    source?: PdfReaderSource,
    handle?: import("./recent-files").PdfFileHandle,
  ) => {
    const token = ++version.current
    dispose()
    setLoading(true)
    setError("")
    setSelection("")
    setRequest(null)
    setDocumentInfo(null)
    setSummaryModalPage(null)
    setQuickWord(null)
    setPanX(0)
    setActiveStudyPanel("")
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
        id,
      )
      current.current = { task, viewport, saver }
      await viewport.init(saved.position ?? undefined)
      if (token !== version.current) return
      setDocumentInfo({ id, historyId, title, count: pdf.numPages, viewport, pdf, file })
      document.title = `${title} | FlowRead`
      void rememberPdf(id, title, file.size, handle, () => token === version.current).catch(
        () => {},
      )
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

  const captureImage = async () => {
    const active = current.current,
      token = version.current
    if (!active?.viewport) return
    setShotBusy(true)
    try {
      const image = await active.viewport.captureVisible()
      if (token === version.current) await sendMessage("openImageTranslation", { image })
    } catch (cause) {
      if (token === version.current)
        setError(cause instanceof Error ? cause.message : "Chưa chụp được vùng PDF.")
    } finally {
      setShotBusy(false)
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

  const translateSelection = (overrideText?: unknown) => {
    const textToTranslate = typeof overrideText === "string" ? overrideText : selection
    if (
      !documentInfo ||
      !textToTranslate ||
      typeof textToTranslate !== "string" ||
      !textToTranslate.trim()
    )
      return
    if (host.current?.dataset.studyTool !== "select") return
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && host.current) {
      const range = sel.getRangeAt(0)
      const rects = Array.from(range.getClientRects())
      if (rects.length > 0) {
        const pagesMap: Record<
          number,
          Array<{ x: number; y: number; width: number; height: number }>
        > = {}
        const pageElements = Array.from(host.current.querySelectorAll<HTMLElement>(".rf-pdf-page"))

        for (const r of rects) {
          if (r.width < 1 || r.height < 1) continue
          let bestPage: HTMLElement | null = null
          let maxOverlap = 0
          for (const pageEl of pageElements) {
            const pRect = pageEl.getBoundingClientRect()
            const overlap = Math.min(r.bottom, pRect.bottom) - Math.max(r.top, pRect.top)
            if (overlap > maxOverlap) {
              maxOverlap = overlap
              bestPage = pageEl
            }
          }
          if (bestPage) {
            const pageNum = Number(bestPage.dataset.page) || selectionPage
            if (!pagesMap[pageNum]) pagesMap[pageNum] = []
            pagesMap[pageNum].push(pageBox(bestPage, r))
          }
        }

        const finalHighlights: Record<
          number,
          Array<{ x: number; y: number; width: number; height: number }>
        > = {}
        for (const [pStr, rawList] of Object.entries(pagesMap)) {
          const pNum = Number(pStr)
          finalHighlights[pNum] = mergeHighlightBoxes(rawList)
        }
        if (Object.keys(finalHighlights).length > 0) {
          setActiveHighlight(finalHighlights)
        }
      }
    }
    setBilingual(false)
    setRequest({
      id: getRandomUUID(),
      text: textToTranslate.length > MAX_NATIVE_SELECTION_LENGTH ? "" : textToTranslate,
      tooLong: textToTranslate.length > MAX_NATIVE_SELECTION_LENGTH,
      createdAt: Date.now(),
      document: { id: documentInfo.historyId, title: documentInfo.title },
      source: {
        kind: "pdf",
        documentId: documentInfo.id,
        page: selectionPage,
      },
    })
    setSelection("")
  }

  useEffect(() => {
    const el = host.current
    if (!el) return undefined

    const renderHighlight = () => {
      const existing = el.querySelectorAll(".rf-active-translation-layer")
      existing.forEach((layer) => layer.remove())

      if (!activeHighlight) return

      for (const [pageStr, boxes] of Object.entries(activeHighlight)) {
        const pageNum = Number(pageStr)
        if (!Number.isFinite(pageNum)) continue
        const pageEl = el.querySelector<HTMLElement>(`.rf-pdf-page[data-page="${pageNum}"]`)
        if (!pageEl) continue

        const layer = document.createElement("div")
        layer.className = "rf-active-translation-layer"
        canonicalLayer(pageEl, layer)

        for (const box of boxes) {
          const mark = document.createElement("div")
          mark.className = "rf-active-translation-highlight"
          mark.style.left = `${(box.x * 100).toFixed(3)}%`
          mark.style.top = `${(box.y * 100).toFixed(3)}%`
          mark.style.width = `${(box.width * 100).toFixed(3)}%`
          mark.style.height = `${(box.height * 100).toFixed(3)}%`
          layer.appendChild(mark)
        }

        pageEl.appendChild(layer)
      }
    }

    renderHighlight()

    el.addEventListener("rf-pdf-render", renderHighlight)
    el.addEventListener("rf-pdf-view-change", renderHighlight)

    return () => {
      el.removeEventListener("rf-pdf-render", renderHighlight)
      el.removeEventListener("rf-pdf-view-change", renderHighlight)
      const existing = el.querySelectorAll(".rf-active-translation-layer")
      existing.forEach((layer) => layer.remove())
    }
  }, [activeHighlight, documentInfo])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.repeat ||
        event.isComposing ||
        !(event.code === "KeyQ" || event.key.toLowerCase() === "q" || event.key === "Enter") ||
        (event.target as Element)?.closest("input,textarea,select,[contenteditable=true]")
      )
        return
      const selected = window.getSelection()
      if (
        !selected?.anchorNode ||
        !selected.focusNode ||
        !host.current?.contains(selected.anchorNode) ||
        !host.current.contains(selected.focusNode) ||
        !selected.toString().trim()
      )
        return
      event.preventDefault()
      translateSelection()
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  })

  const handleExportStudyNotes = async () => {
    if (!documentInfo) return
    try {
      const study = await loadStudy(documentInfo.id)
      const translations = await listPdfHistory(documentInfo.historyId)
      const bookmarks = documentInfo.viewport.workspace.getSnapshot().data.bookmarks
      const textNotes = documentInfo.viewport.textNotes.getSnapshot().data.notes

      const library = await loadLibrary()
      const sourceCards = new Set(
        library.sources
          .filter(
            (source) =>
              source.locator.kind === "pdf" &&
              [documentInfo.id, documentInfo.historyId].includes(source.locator.documentId ?? ""),
          )
          .map((source) => source.cardId),
      )
      const vocabularyWords = library.cards
        .filter((card) => sourceCards.has(card.id))
        .map((card) => ({
          word: card.word,
          ipa: card.ipa,
          meaning: card.meaning,
          context: card.context,
        }))
      if (current.current?.viewport !== documentInfo.viewport) return

      exportStudySummaryFile({
        documentId: documentInfo.id,
        title: documentInfo.title,
        numPages: documentInfo.pdf.numPages,
        bookmarks: bookmarks.map((b) => ({
          page: b.page,
          name: b.name,
          note: b.note,
          color: b.color,
        })),
        textNotes: textNotes.map((n) => ({
          page: n.page,
          text: n.text,
          color: n.color,
        })),
        annotations: study.annotations.map((a) => ({
          page: a.page,
          kind: a.kind,
          text: a.text,
          color: a.color,
        })),
        translations: translations.map((t) => ({
          original: t.original,
          output: t.output,
          targetLanguage: t.targetLanguage,
          updatedAt: t.updatedAt,
        })),
        vocabularyWords,
      })
    } catch (err: any) {
      alert("Không thể xuất ghi chú học tập: " + (err?.message || "Lỗi"))
    }
  }

  return (
    <main className="rf-reader">
      <header className="rf-reader-toolbar">
        <strong className="rf-reader-brand">
          <BookOpen size={22} />
          <span>
            FlowRead <small>PDF Reader</small>
          </span>
        </strong>
        {documentInfo && (
          <span className="rf-reader-name" title={documentInfo.title}>
            <FileText size={16} />
            {documentInfo.title}
          </span>
        )}
        <button
          type="button"
          onClick={async () => {
            const pickerVersion = version.current
            const picker = pdfPicker()
            if (picker) {
              try {
                const [handle] = await picker({
                  types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
                })
                if (handle) {
                  const file = await handle.getFile()
                  if (pickerVersion === version.current)
                    void load(file, file.name, undefined, handle)
                  return
                }
              } catch (pickerError) {
                if (pickerError instanceof DOMException && pickerError.name === "AbortError") return
              }
            }
            input.current?.click()
          }}
        >
          <FolderOpen size={17} /> Mở PDF trên máy
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
        <RecentFilesMenu
          refresh={documentInfo?.id ?? ""}
          onOpen={async (item) => {
            if (!item.handle) {
              input.current?.click()
              return
            }
            const token = version.current
            try {
              const permission = await item.handle.queryPermission({ mode: "read" })
              if (
                permission !== "granted" &&
                (await item.handle.requestPermission({ mode: "read" })) !== "granted"
              ) {
                if (token === version.current) input.current?.click()
                return
              }
              const file = await item.handle.getFile()
              if (token === version.current) await load(file, file.name, undefined, item.handle)
            } catch {
              if (token === version.current) input.current?.click()
            }
          }}
        />
        {documentInfo && (
          <>
            <button
              type="button"
              aria-pressed={bilingual}
              onClick={() => {
                setRequest(null)
                setActiveHighlight(null)
                setSelection("")
                setBilingual((value) => !value)
              }}
            >
              <Languages size={17} />{" "}
              {i18n.t("pdfReader.paragraphBilingual") || "Song ngữ theo đoạn"}
            </button>
            {bilingual && (
              <button
                type="button"
                id="pdf-translate-page"
                disabled={bilingualBusy}
                onClick={() => bilingualPane.current?.translatePage()}
              >
                <Languages size={17} /> Dịch trang đang xem
              </button>
            )}
            <button type="button" disabled={shotBusy} onClick={() => void captureImage()}>
              <ScanLine size={17} /> {shotBusy ? "Đang chụp…" : "Chụp vùng & dịch ảnh"}
            </button>

            <PdfReaderNavigation
              key={documentInfo.id}
              viewport={documentInfo.viewport}
              view={view}
              count={documentInfo.count}
            />
            <PdfDocumentActions
              key={`actions-${documentInfo.id}`}
              file={documentInfo.file}
              pdf={documentInfo.pdf}
              viewport={documentInfo.viewport}
              title={documentInfo.title}
            />
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
          cả đổi tên, sẽ trở về chỗ đang đọc. PDF không được sao chép vào bộ nhớ extension. Dùng Gần
          đây để mở lại; trình duyệt có thể yêu cầu cấp lại quyền đọc file. Chức năng tự lưu hoạt
          động trong trình đọc FlowRead này.
        </p>
      )}
      {documentInfo && (
        <PdfStudyTools
          key={documentInfo.id}
          id={documentInfo.id}
          pdf={documentInfo.pdf}
          file={documentInfo.file}
          title={documentInfo.title}
          viewport={documentInfo.viewport}
          page={view.page}
          onOpenAiOcr={captureImage}
          imageBusy={shotBusy}
          hasSelection={!!selection}
          onTranslateSelection={() => translateSelection()}
          onSummarizePage={(pg) => setSummaryModalPage(pg)}
          onExportStudyNotes={handleExportStudyNotes}
          onPanelChange={setActiveStudyPanel}
        />
      )}
      <div className="rf-reader-body">
        <div
          ref={originalColumnRef}
          className={`rf-reader-original-column ${activeStudyPanel ? "rf-has-left-panel" : ""}`}
          style={
            {
              ...(bilingual && documentInfo ? { flex: "1 1 0%" } : {}),
              ...(!bilingual && request ? { flex: "1 1 0%", minWidth: 0 } : {}),
              "--rf-pdf-pan-x": `${panX}px`,
            } as React.CSSProperties
          }
        >
          {bilingual && documentInfo && (
            <div key="pdf-label" className="rf-bilingual-source-heading">
              BẢN GỐC · Trang {view.page}
            </div>
          )}
          <div
            key="pdf-host"
            ref={host}
            className="rf-pdf-scroll"
            aria-label="Nội dung PDF"
            tabIndex={0}
            onMouseUp={() => {
              if (
                host.current?.dataset.annotationEditing === "true" ||
                (host.current?.dataset.studyTool && host.current.dataset.studyTool !== "select")
              ) {
                setSelection("")
                return
              }
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
              if (
                host.current?.dataset.annotationEditing === "true" ||
                (host.current?.dataset.studyTool && host.current.dataset.studyTool !== "select")
              )
                return
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
            onDoubleClick={() => {
              if (
                host.current?.dataset.annotationEditing === "true" ||
                (host.current?.dataset.studyTool && host.current.dataset.studyTool !== "select")
              ) {
                return
              }
              const sel = window.getSelection()
              const text = sel?.toString().trim()
              if (
                text &&
                /^[A-Za-z][A-Za-z'-]{1,45}$/.test(text) &&
                sel &&
                sel.rangeCount > 0 &&
                host.current?.contains(sel.anchorNode)
              ) {
                const range = sel.getRangeAt(0)
                const clientRect = range.getBoundingClientRect()
                const parent =
                  sel.anchorNode?.parentElement?.closest<HTMLElement>(".textLayer,.rf-ocr-text")
                const nativeText = parent?.textContent ?? text
                const at = Math.max(0, nativeText.indexOf(text))
                const context = nativeText.slice(Math.max(0, at - 300), at + 700)
                setQuickWord({
                  word: text,
                  rect: {
                    top: clientRect.top,
                    bottom: clientRect.bottom,
                    left: clientRect.left,
                    right: clientRect.right,
                    width: clientRect.width,
                    height: clientRect.height,
                  },
                  context,
                  page:
                    Number(parent?.closest<HTMLElement>(".rf-pdf-page")?.dataset.page) || view.page,
                })
              }
            }}
          />
          {documentInfo && (
            <HorizontalPositionBar
              offset={panX}
              onChange={setPanX}
              containerRef={originalColumnRef}
            />
          )}
          {quickWord && documentInfo && (
            <QuickDictionaryPopover
              target={quickWord}
              documentId={documentInfo.id}
              documentTitle={documentInfo.title}
              config={config}
              onClose={() => setQuickWord(null)}
              onOpenPanel={(word) => {
                setQuickWord(null)
                setSelection(word)
                translateSelection(word)
              }}
            />
          )}
        </div>
        {bilingual && documentInfo && (
          <div
            className="rf-bilingual-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Kéo để chỉnh tỷ lệ cột song ngữ"
            title="Kéo chuột để chỉnh độ rộng · Bấm đúp về 50/50"
            onPointerDown={onSplitterDown}
            onDoubleClick={() => {
              setBilingualWidth(50)
              try {
                localStorage.setItem("rf-bilingual-width", "50")
              } catch {}
            }}
          >
            <div className="rf-bilingual-splitter-handle" />
          </div>
        )}
        {bilingual && documentInfo && (
          <PdfBilingualPane
            key={documentInfo.id}
            ref={bilingualPane}
            viewport={documentInfo.viewport}
            pdf={documentInfo.pdf}
            document={{ id: documentInfo.historyId, title: documentInfo.title }}
            pageCount={documentInfo.count}
            onBusy={setBilingualBusy}
            textOptions={textOptions}
            width={bilingualWidth}
          />
        )}
        {!bilingual && request && (
          <div
            className="rf-bilingual-splitter rf-translation-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="Kéo để chỉnh độ rộng khung dịch"
            title="Kéo chuột để chỉnh độ rộng khung dịch · Bấm đúp về mặc định (390px)"
            onPointerDown={onTranslationSplitterDown}
            onDoubleClick={() => {
              setTranslationWidth(390)
              try {
                localStorage.setItem("rf-translation-width", "390")
              } catch {}
            }}
          >
            <div className="rf-bilingual-splitter-handle" />
          </div>
        )}
        {!bilingual && request && (
          <aside
            className="rf-reader-translation"
            style={{ width: `var(--rf-translation-width, ${translationWidth}px)`, flex: "none" }}
          >
            <button
              type="button"
              onClick={() => {
                setRequest(null)
                setActiveHighlight(null)
              }}
            >
              {i18n.t("selectionResult.closePanel") || "Đóng khung dịch ×"}
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
      {summaryModalPage !== null && documentInfo && (
        <PdfPageSummaryModal
          page={summaryModalPage}
          documentId={documentInfo.id}
          viewport={documentInfo.viewport}
          pdf={documentInfo.pdf}
          config={config}
          onClose={() => setSummaryModalPage(null)}
        />
      )}
    </main>
  )
}
