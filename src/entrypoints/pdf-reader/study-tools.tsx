import type { PDFDocumentProxy } from "pdfjs-dist"
import type { Annotation, StudyDocument } from "./study-data"
import type { StudyTool } from "./study-layer"
import type { PdfViewport } from "./viewport"
import {
  Search,
  PanelLeft,
  MousePointer2,
  Move,
  Pencil,
  Circle,
  Minus,
  ArrowUpRight,
  Languages,
  RectangleHorizontal,
  Eraser,
  StickyNote,
  Highlighter,
  Undo2,
  Redo2,
  MessageSquareText,
  ScanText,
  Download,
  FileText,
  ChevronUp,
  ChevronDown,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { LocalPdfOcr } from "./local-ocr"
import { loadStudy, saveStudy, compilePdfSearch, STUDY_COLORS } from "./study-data"
import { PdfStudyLayer } from "./study-layer"
import { StudyPanel } from "./study-panel"
import { PdfTextIndex } from "./text-index"

type Panel = "" | "search" | "outline" | "pages" | "annotations" | "ocr"
type Outline = { title: string; dest: string | unknown[] | null; depth: number }
type Hit = { page: number; text: string; index: number }
export function PdfStudyTools({
  id,
  pdf,
  file,
  viewport,
  page,
  title,
  onOpenAiOcr,
  imageBusy,
  hasSelection,
  onTranslateSelection,
}: {
  id: string
  pdf: PDFDocumentProxy
  file: Blob
  viewport: PdfViewport
  page: number
  title: string
  onOpenAiOcr: () => Promise<void>
  imageBusy: boolean
  hasSelection: boolean
  onTranslateSelection: () => void
}) {
  const [data, setData] = useState<StudyDocument | null>(null),
    dataRef = useRef<StudyDocument | null>(null)
  const [panel, setPanel] = useState<Panel>(""),
    [tool, setTool] = useState<StudyTool>("select")
  const [color, setColor] = useState<string>(STUDY_COLORS[0]),
    [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false),
    [exporting, setExporting] = useState(false)
  const [query, setQuery] = useState(""),
    [hits, setHits] = useState<Hit[]>([]),
    [searching, setSearching] = useState(false)
  const [activeHit, setActiveHit] = useState(-1),
    [outlineQuery, setOutlineQuery] = useState("")
  const [outline, setOutline] = useState<Outline[]>([]),
    [pageGroup, setPageGroup] = useState(0)
  const [language, setLanguage] = useState("eng"),
    [rangeEnd, setRangeEnd] = useState("")
  const [ocrBusy, setOcrBusy] = useState(false),
    [ocrStatus, setOcrStatus] = useState("")
  const [history, setHistory] = useState({ undo: 0, redo: 0 })
  const layer = useRef<PdfStudyLayer | null>(null),
    searchInput = useRef<HTMLInputElement>(null)
  const alive = useRef(false),
    ocr = useRef<LocalPdfOcr | null>(null),
    run = useRef(0),
    searchRun = useRef(0)
  const writeBusy = useRef(false),
    undo = useRef<Annotation[][]>([]),
    redo = useRef<Annotation[][]>([])
  const ocrPage = useRef(0)
  const textIndex = useRef<PdfTextIndex | null>(null)
  const refreshHistory = () => setHistory({ undo: undo.current.length, redo: redo.current.length })
  const report = (error: unknown) => {
    if (alive.current)
      setMessage(error instanceof Error ? error.message : "Không lưu được dữ liệu đọc.")
  }
  const install = (value: StudyDocument) => {
    dataRef.current = value
    setData(value)
    layer.current?.set(value)
  }
  const write = async (
    change: (previous: StudyDocument) => StudyDocument,
    record = false,
    canCommit: () => boolean = () => true,
  ): Promise<boolean> => {
    if (!dataRef.current || !alive.current) return false
    if (writeBusy.current) {
      setMessage("Đang lưu; hãy chờ trước khi sửa tiếp.")
      return false
    }
    writeBusy.current = true
    setSaving(true)
    const previous = dataRef.current
    try {
      const value = await saveStudy(previous, change(previous), canCommit)
      if (!alive.current) return false
      if (record) {
        undo.current.push(previous.annotations)
        if (undo.current.length > 50) undo.current.shift()
        redo.current = []
      }
      install(value)
      refreshHistory()
      setMessage("Đã lưu trên máy.")
      return true
    } catch (error) {
      report(error)
      return false
    } finally {
      writeBusy.current = false
      if (alive.current) setSaving(false)
    }
  }
  const add = (items: Annotation[]) => {
    if (items.length) void write((p) => ({ ...p, annotations: [...p.annotations, ...items] }), true)
    else setMessage("Bôi đen chữ trong PDF trước khi tô sáng.")
  }
  const remove = (annotationId: string) =>
    void write(
      (p) => ({ ...p, annotations: p.annotations.filter((a) => a.id !== annotationId) }),
      true,
    )
  const update = async (before: Annotation, after: Annotation | null, current: () => boolean) => {
    if (dataRef.current?.annotations.find((item) => item.id === before.id) !== before) {
      setMessage("Chú thích đã thay đổi. Hãy chọn lại hình trước khi sửa.")
      return false
    }
    return write(
      (p) => ({
        ...p,
        annotations: after
          ? p.annotations.map((item) => (item.id === before.id ? after : item))
          : p.annotations.filter((item) => item.id !== before.id),
      }),
      true,
      current,
    )
  }
  const reverse = async (direction: "undo" | "redo") => {
    const from = direction === "undo" ? undo.current : redo.current
    const to = direction === "undo" ? redo.current : undo.current
    const annotations = from.at(-1),
      previous = dataRef.current?.annotations
    if (!annotations || !previous || writeBusy.current) return
    if (await write((p) => ({ ...p, annotations }))) {
      from.pop()
      to.push(previous)
      refreshHistory()
    }
  }
  // One controller per document. No PDF host remounts when tools/panels change.
  useEffect(() => {
    alive.current = true
    const index = new PdfTextIndex(pdf)
    textIndex.current = index
    const controller = new PdfStudyLayer(viewport.element, add, remove, update)
    layer.current = controller
    void loadStudy(id)
      .then((value) => {
        if (alive.current) install(value)
      })
      .catch(report)
    const flatten = (
      items: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>,
      depth = 0,
    ): Outline[] => {
      if (!items || depth > 12) return []
      const result: Outline[] = []
      for (const item of items.slice(0, 500)) {
        result.push({ title: item.title.slice(0, 240), dest: item.dest, depth })
        result.push(...flatten(item.items, depth + 1))
        if (result.length >= 500) break
      }
      return result.slice(0, 500)
    }
    void pdf
      .getOutline()
      .then((items) => {
        if (alive.current) setOutline(flatten(items))
      })
      .catch(() => {})
    const keys = (event: KeyboardEvent) => {
      const edit = (event.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable=true]",
      )
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault()
        setPanel("search")
        setTool("select")
        searchInput.current?.focus()
      } else if (!edit && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault()
        void reverse(event.shiftKey ? "redo" : "undo")
      } else if (!edit && event.key === "Escape") {
        setPanel("")
        setTool("select")
      }
    }
    window.addEventListener("keydown", keys)
    return () => {
      alive.current = false
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- task counters, not DOM refs.
      ++run.current
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- task counters, not DOM refs.
      ++searchRun.current
      ocr.current?.cancel()
      controller.destroy()
      index.destroy()
      textIndex.current = null
      layer.current = null
      window.removeEventListener("keydown", keys)
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- keyed document lifetime; controller callbacks use refs, not render snapshots.
  }, [id, pdf, viewport])
  useEffect(() => {
    layer.current?.setTool(tool)
    if (layer.current) layer.current.color = color
  }, [tool, color])
  useEffect(() => {
    if (!ocr.current || ocrPage.current === page) return
    ++run.current
    ocr.current.cancel()
    ocr.current = null
    // oxlint-disable-next-line react/set-state-in-effect -- reflect cancellation of the external OCR worker on page navigation.
    setOcrBusy(false)
    // oxlint-disable-next-line react/set-state-in-effect -- show the external worker cancellation caused by navigation.
    setOcrStatus("Đã dừng OCR khi chuyển trang.")
  }, [page])
  useEffect(() => {
    if (panel === "search") searchInput.current?.focus()
  }, [panel])
  const changeQuery = (value: string) => {
    ++searchRun.current
    setQuery(value)
    setHits([])
    setActiveHit(-1)
    setSearching(false)
    if (dataRef.current) layer.current?.set(dataRef.current, "")
  }
  const search = async () => {
    const token = ++searchRun.current,
      needle = query.trim()
    if (!needle || !dataRef.current) return
    setSearching(true)
    setHits([])
    setActiveHit(-1)
    layer.current?.set(dataRef.current, needle)
    const found: Hit[] = []
    const matchText = compilePdfSearch(needle),
      textCache = textIndex.current
    let chars = 0
    try {
      // Paint the busy state even when every page is served from RAM.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      let slice = performance.now()
      for (let number = 1; number <= pdf.numPages; number++) {
        if (token !== searchRun.current || !alive.current || !textCache) return
        const cached = dataRef.current.ocr.find((p) => p.page === number)
        const { source, folded } = await textCache.get(number, cached)
        if (token !== searchRun.current || !alive.current) return
        chars += source.length
        const matches = matchText(folded)
        for (const [index, match] of matches.entries()) {
          if (found.length >= 1000) break
          found.push({
            page: number,
            index,
            text: source.slice(
              Math.max(0, match.start - 35),
              Math.min(match.end + 80, match.start + 240),
            ),
          })
        }
        if (found.length >= 1000 || chars > 20_000_000) {
          setMessage("Đã đạt giới hạn tìm kiếm. Thu hẹp từ khóa nếu cần.")
          break
        }
        if (performance.now() - slice >= 8) {
          setHits([...found])
          await new Promise<void>((resolve) => setTimeout(resolve, 0))
          slice = performance.now()
        }
      }
      if (token === searchRun.current && alive.current) setHits(found)
    } catch {
      if (alive.current && token === searchRun.current)
        setMessage("Chưa tìm được hết tài liệu. Thử lại với từ khóa khác.")
    } finally {
      if (token === searchRun.current && alive.current) setSearching(false)
    }
  }
  const recognize = async () => {
    if (!dataRef.current || ocrBusy) return
    const start = page,
      end = rangeEnd ? Number(rangeEnd) : start
    if (!Number.isInteger(end) || end < start || end > pdf.numPages || end - start >= 20) {
      setMessage("Chọn tối đa 20 trang, bắt đầu từ trang đang xem.")
      return
    }
    const token = ++run.current
    ocrPage.current = start
    setOcrBusy(true)
    const worker = new LocalPdfOcr()
    ocr.current = worker
    try {
      for (let n = start; n <= end; n++) {
        const value = await worker.read(pdf, n, language, (text) => {
          if (token === run.current && alive.current) setOcrStatus(`Trang ${n}/${end} · ${text}`)
        })
        if (token !== run.current || !alive.current) return
        if (!value.words.length) {
          setOcrStatus(`Trang ${n}: chưa nhận được chữ rõ ràng.`)
          continue
        }
        const success = await write(
          (p) => ({
            ...p,
            ocr: [...p.ocr.filter((v) => v.page !== n), value],
          }),
          false,
          () => token === run.current && alive.current,
        )
        if (!success || token !== run.current) return
        setOcrStatus(
          `Đã đọc trang ${n}: ${value.words.length} cụm chữ. Có thể bôi đen, tìm kiếm hoặc mở Song ngữ theo đoạn.`,
        )
      }
    } catch (error) {
      if (token === run.current) report(error)
    } finally {
      worker.cancel()
      if (token === run.current && alive.current) {
        ocr.current = null
        setOcrBusy(false)
      }
    }
  }
  const toggle = (next: Panel) => {
    setPanel((p) => (p === next ? "" : next))
    setTool("select")
  }
  const pickHit = (index: number) => {
    const hit = hits[index]
    if (!hit) return
    setActiveHit(index)
    layer.current?.focusMatch(hit.page, hit.index)
    viewport.navigate(hit.page)
  }
  return (
    <section className="rf-study-tools" aria-label="Công cụ đọc PDF">
      <div className="rf-study-toolbar">
        <button
          type="button"
          aria-expanded={panel === "search"}
          onClick={() => toggle("search")}
          title="Tìm kiếm (Ctrl+F)"
        >
          <Search size={17} /> Tìm kiếm <kbd>Ctrl F</kbd>
        </button>
        <button
          type="button"
          aria-expanded={panel === "outline" || panel === "pages"}
          onClick={() => toggle(outline.length ? "outline" : "pages")}
        >
          <PanelLeft size={17} /> Mục lục / Trang
        </button>
        <div className="rf-tool-segment" role="group" aria-label="Công cụ PDF">
          {(
            [
              { value: "select", label: "Chọn chữ", Icon: MousePointer2 },
              { value: "edit", label: "Chọn / sửa hình", Icon: Move },
              { value: "ink", label: "Vẽ", Icon: Pencil },
              { value: "circle", label: "Hình tròn", Icon: Circle },
              { value: "line", label: "Đường thẳng", Icon: Minus },
              { value: "arrow", label: "Mũi tên", Icon: ArrowUpRight },
              { value: "rectangle", label: "Hình chữ nhật", Icon: RectangleHorizontal },
              { value: "erase", label: "Tẩy chú thích", Icon: Eraser },
              { value: "note", label: "Ghi chú", Icon: StickyNote },
            ] as const
          ).map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              className="rf-icon-button"
              aria-label={label}
              title={
                value === "circle" ? "Tròn / elip: kéo ngang dọc; giữ Shift để vẽ tròn" : label
              }
              aria-pressed={tool === value}
              onClick={() => setTool(value)}
            >
              <Icon size={17} />
            </button>
          ))}
        </div>
        <div className="rf-tool-colors" role="group" aria-label="Màu chú thích">
          {STUDY_COLORS.map((c, i) => (
            <button
              type="button"
              key={c}
              aria-label={["Vàng", "Xanh lá", "Xanh dương", "Đỏ"][i]}
              title={["Vàng", "Xanh lá", "Xanh dương", "Đỏ"][i]}
              aria-pressed={color === c}
              className="rf-color-dot"
              style={{ "--annotation-color": c } as React.CSSProperties}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <button
          type="button"
          disabled={!data || saving}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => add(layer.current?.highlight() ?? [])}
        >
          <Highlighter size={17} /> Tô sáng đoạn chọn
        </button>
        <button
          type="button"
          disabled={saving || !history.undo}
          aria-label="Hoàn tác"
          title="Hoàn tác (Ctrl+Z)"
          className="rf-icon-button"
          onClick={() => void reverse("undo")}
        >
          <Undo2 size={17} />
        </button>
        <button
          type="button"
          disabled={saving || !history.redo}
          aria-label="Làm lại"
          title="Làm lại (Ctrl+Shift+Z)"
          className="rf-icon-button"
          onClick={() => void reverse("redo")}
        >
          <Redo2 size={17} />
        </button>
        <button type="button" onClick={() => toggle("annotations")}>
          <MessageSquareText size={17} /> Chú thích{" "}
          <span className="rf-tool-count">{data?.annotations.length ?? 0}</span>
        </button>
        <button type="button" aria-expanded={panel === "ocr"} onClick={() => toggle("ocr")}>
          <ScanText size={17} /> OCR trên máy
        </button>
        <div className="rf-study-actions">
          <button
            type="button"
            className="rf-translate-selection"
            disabled={!hasSelection || tool !== "select"}
            title="Bôi đen chữ trong PDF rồi bấm để dịch"
            onPointerDown={(e) => e.preventDefault()}
            onClick={onTranslateSelection}
          >
            <Languages size={17} /> Dịch đoạn đã chọn
          </button>
          <button
            type="button"
            disabled={!data || exporting || saving}
            className="rf-export-pdf"
            onClick={async () => {
              if (!dataRef.current) return
              setExporting(true)
              try {
                const { exportAnnotatedPdf } = await import("./study-export")
                const blob = await exportAnnotatedPdf(file, pdf, dataRef.current.annotations)
                if (!alive.current) return
                const url = URL.createObjectURL(blob),
                  link = document.createElement("a")
                link.href = url
                link.download = `${title.replace(/[\\/:*?"<>|]/g, "-")}-ReadFrog.pdf`
                link.click()
                setTimeout(() => URL.revokeObjectURL(url), 60000)
                setMessage(
                  "Đã xuất bản PDF có chú thích. File gốc không đổi; lớp chữ OCR và bản dịch chỉ lưu trong Read Frog.",
                )
              } catch (error) {
                report(error)
              } finally {
                if (alive.current) setExporting(false)
              }
            }}
          >
            <Download size={17} /> {exporting ? "Đang xuất…" : "Tải PDF có chú thích"}
          </button>
        </div>
      </div>
      {tool === "edit" && (
        <p className="rf-tool-hint">
          Bấm vào hình để chọn. Kéo trong hình để di chuyển; kéo các chốt cạnh/góc để đổi kích
          thước.
        </p>
      )}
      {tool === "circle" && (
        <p className="rf-tool-hint">
          Kéo để vẽ elip ngang/dọc. Giữ Shift để vẽ hình tròn. Bấm vào nét hình để đổi màu, di
          chuyển, đổi kích thước hoặc xóa.
        </p>
      )}
      {(tool === "line" || tool === "arrow") && (
        <p className="rf-tool-hint">
          Kéo để vẽ. Giữ Shift để cố định ngang, dọc hoặc góc 45°. Bấm vào nét để đổi màu, di
          chuyển, kéo hai đầu hoặc xóa.
        </p>
      )}
      {message && (
        <p role="status" className="rf-study-message">
          {message}
        </p>
      )}
      {panel && (
        <StudyPanel
          title={
            {
              search: "Tìm trong tài liệu",
              outline: "Mục lục",
              pages: "Danh sách trang",
              annotations: "Chú thích",
              ocr: "Nhận dạng chữ PDF scan",
            }[panel]
          }
          onClose={() => setPanel("")}
        >
          {panel === "search" && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void search()
                }}
              >
                <input
                  ref={searchInput}
                  aria-label="Từ khóa PDF"
                  type="search"
                  placeholder="Nhập từ hoặc mẫu abx*xyz"
                  autoComplete="off"
                  value={query}
                  maxLength={200}
                  onChange={(e) => changeQuery(e.target.value)}
                />
                <button type="submit" disabled={!query.trim() || searching || !data}>
                  {searching ? "Đang tìm…" : "Tìm"}
                </button>
              </form>
              {searching && (
                <button
                  type="button"
                  onClick={() => {
                    ++searchRun.current
                    setSearching(false)
                  }}
                >
                  Dừng tìm
                </button>
              )}
              <p className="rf-search-summary" role="status">
                {hits.length} kết quả · {new Set(hits.map((h) => h.page)).size} trang
              </p>
              {!!hits.length && (
                <div className="rf-search-navigation">
                  <span>
                    {activeHit < 0 ? "Chọn kết quả để xem" : `${activeHit + 1} / ${hits.length}`}
                  </span>
                  <button
                    type="button"
                    aria-label="Kết quả trước"
                    disabled={searching}
                    onClick={() =>
                      pickHit(
                        activeHit < 0
                          ? hits.length - 1
                          : (activeHit - 1 + hits.length) % hits.length,
                      )
                    }
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Kết quả sau"
                    disabled={searching}
                    onClick={() => pickHit((activeHit + 1) % hits.length)}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              )}
              {!hits.length && (
                <div className="rf-search-empty">
                  <Search size={28} />
                  <strong>{query ? "Chưa có kết quả" : "Tìm nội dung trong PDF"}</strong>
                  <span>
                    Nhập từ khóa, nhấn Enter. Dùng * để tìm phần chữ ở giữa; trang scan cần OCR
                    trước.
                  </span>
                </div>
              )}
              {hits.map((h, index) => (
                <button
                  className="rf-study-result"
                  type="button"
                  key={`${h.page}:${h.index}`}
                  aria-current={activeHit === index ? "true" : undefined}
                  onClick={() => pickHit(index)}
                >
                  <span className="rf-result-location">
                    Trang {h.page} · Kết quả {h.index + 1}
                  </span>
                  <span className="rf-result-excerpt">{h.text}</span>
                </button>
              ))}
            </>
          )}
          {(panel === "outline" || panel === "pages") && (
            <>
              <nav>
                <button
                  type="button"
                  aria-pressed={panel === "outline"}
                  onClick={() => setPanel("outline")}
                >
                  Mục lục
                </button>
                <button
                  type="button"
                  aria-pressed={panel === "pages"}
                  onClick={() => setPanel("pages")}
                >
                  Trang
                </button>
              </nav>
              {panel === "outline" && (
                <>
                  {!!outline.length && (
                    <input
                      className="rf-outline-filter"
                      aria-label="Lọc mục lục PDF"
                      type="search"
                      placeholder="Lọc mục lục…"
                      value={outlineQuery}
                      onChange={(event) => setOutlineQuery(event.target.value)}
                    />
                  )}
                  {!outline.length && (
                    <p>File này không có mục lục nhúng. Dùng danh sách Trang để di chuyển.</p>
                  )}
                  {outline
                    .filter((item) =>
                      item.title
                        .toLocaleLowerCase()
                        .includes(outlineQuery.trim().toLocaleLowerCase()),
                    )
                    .map((item) => (
                      <button
                        type="button"
                        key={`${item.depth}:${item.title}:${JSON.stringify(item.dest)}`}
                        className="rf-study-result"
                        style={{ paddingLeft: 8 + item.depth * 12 }}
                        onClick={async () => {
                          try {
                            const dest =
                              typeof item.dest === "string"
                                ? await pdf.getDestination(item.dest)
                                : item.dest
                            if (!dest?.length) return
                            const ref = dest[0],
                              index =
                                typeof ref === "number"
                                  ? ref
                                  : await pdf.getPageIndex(ref as { num: number; gen: number })
                            if (alive.current && Number.isInteger(index))
                              viewport.navigate(index + 1)
                          } catch {
                            report(new Error("Không mở được mục này."))
                          }
                        }}
                      >
                        {item.title}
                      </button>
                    ))}
                </>
              )}
              {panel === "pages" && (
                <>
                  <p>
                    {pdf.numPages} trang · Đang xem trang {page}
                  </p>
                  <label>
                    Nhóm trang{" "}
                    <select
                      value={pageGroup}
                      onChange={(e) => setPageGroup(Number(e.target.value))}
                    >
                      {Array.from({ length: Math.ceil(pdf.numPages / 100) }, (_, i) => (
                        <option key={i} value={i}>
                          {i * 100 + 1}–{Math.min(pdf.numPages, (i + 1) * 100)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="rf-page-grid">
                    {Array.from(
                      { length: Math.min(100, pdf.numPages - pageGroup * 100) },
                      (_, i) => pageGroup * 100 + i + 1,
                    ).map((n) => (
                      <button
                        type="button"
                        key={n}
                        aria-current={page === n ? "page" : undefined}
                        onClick={() => viewport.navigate(n)}
                      >
                        <FileText size={27} strokeWidth={1.2} />
                        <span>Trang {n}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {panel === "annotations" && (
            <>
              <p>
                Chú thích lưu trên máy, gắn theo nội dung PDF. Xuất PDF để mang sang thiết bị khác.
                Hoàn tác áp dụng trong phiên hiện tại.
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void loadStudy(id)
                    .then((value) => {
                      if (alive.current) {
                        install(value)
                        undo.current = []
                        redo.current = []
                        refreshHistory()
                      }
                    })
                    .catch(report)
                }
              >
                Nạp lại chú thích
              </button>
              <button
                type="button"
                disabled={!data?.annotations.length || saving}
                onClick={() => {
                  if (
                    window.confirm(
                      "Xóa toàn bộ chú thích của PDF này? Có thể hoàn tác trong phiên này.",
                    )
                  )
                    void write((p) => ({ ...p, annotations: [] }), true)
                }}
              >
                Xóa chú thích
              </button>
              {!data?.annotations.length && (
                <p>Chưa có chú thích. Bôi đen chữ rồi Tô sáng, hoặc chọn Vẽ / Ghi chú.</p>
              )}
              {data?.annotations.map((a) => (
                <div key={a.id} className="rf-study-annotation">
                  <button type="button" onClick={() => viewport.navigate(a.page)}>
                    Trang {a.page} ·{" "}
                    {a.kind === "ink" ? "Nét vẽ" : a.kind === "note" ? "Ghi chú" : "Tô sáng"}
                    <br />
                    {a.text.slice(0, 240)}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    aria-label="Xóa chú thích"
                    onClick={() => remove(a.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </>
          )}
          {panel === "ocr" && (
            <>
              <p>
                OCR cục bộ, không gửi PDF hay ảnh lên mạng. Chọn đúng ngôn ngữ chính; trang phức
                tạp, công thức hoặc chữ viết tay có thể nhận sai. Chữ OCR sẽ thay lớp chọn chữ của
                trang này trong Read Frog.
              </p>
              <button type="button" disabled={imageBusy} onClick={() => void onOpenAiOcr()}>
                <ScanText size={16} /> OpenAI OCR vùng khó
              </button>
              <p>
                OpenAI: mở công cụ ảnh, chọn vùng rồi bấm đọc/dịch. Dùng model và API key hiện tại,
                có phí theo API; chỉ vùng bạn chọn được gửi đi. Kết quả mở trong khung dịch ảnh,
                không thay tọa độ chữ PDF.
              </p>
              <label>
                Ngôn ngữ chữ{" "}
                <select
                  aria-label="Ngôn ngữ OCR"
                  disabled={ocrBusy}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="eng">English</option>
                  <option value="vie">Tiếng Việt</option>
                  <option value="chi_sim">中文 简体</option>
                  <option value="jpn">日本語</option>
                </select>
              </label>
              <p>Từ trang {page}. Để trống ô dưới để chỉ đọc trang này.</p>
              <label>
                Đến trang{" "}
                <input
                  aria-label="OCR đến trang"
                  type="number"
                  min={page}
                  max={Math.min(pdf.numPages, page + 19)}
                  value={rangeEnd}
                  disabled={ocrBusy}
                  onChange={(e) => setRangeEnd(e.target.value)}
                />
              </label>
              <button
                type="button"
                id="pdf-local-ocr"
                disabled={!data || ocrBusy || saving}
                onClick={() => void recognize()}
              >
                Đọc chữ OCR
              </button>
              {ocrBusy && (
                <button
                  type="button"
                  onClick={() => {
                    ++run.current
                    ocr.current?.cancel()
                    ocr.current = null
                    setOcrBusy(false)
                    setOcrStatus("Đã dừng OCR.")
                  }}
                >
                  Dừng OCR
                </button>
              )}
              <p role="status">{ocrStatus}</p>
              <p>
                Đã lưu {data?.ocr.length ?? 0}/20 trang OCR. Chuyển trang hoặc đóng file sẽ dừng tác
                vụ đang chạy. Mở lại chỉ đọc cache trên máy.
              </p>
              <button
                type="button"
                disabled={ocrBusy || saving || !data?.ocr.length}
                onClick={() => {
                  if (
                    window.confirm("Xóa toàn bộ chữ OCR lưu cho file này? Chú thích vẫn được giữ.")
                  )
                    void write((p) => ({ ...p, ocr: [] }))
                }}
              >
                Xóa chữ OCR đã lưu
              </button>
            </>
          )}
        </StudyPanel>
      )}
    </section>
  )
}
