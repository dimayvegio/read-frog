import type { PDFDocumentProxy } from "pdfjs-dist"
import type { PdfViewport } from "./viewport"
import type { Config } from "@/types/config/config"
import type { ImageEditRequest } from "@/utils/image-translation/generated-schema"
import { languageTagSchema } from "@read-frog/definitions"
import { useAtom } from "jotai"
import { sha256 } from "js-sha256"
import { FileImage, X, Download, Images, FileDown, Check, Loader2 } from "lucide-react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getTargetLanguageItems } from "@/components/language-combobox-options"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { getLocalConfig } from "@/utils/config/storage"
import { getFeatureModelSync } from "@/utils/feature-models/resolver"
import {
  clearGeneratedImages,
  generateTranslatedImage,
  imageEditScope,
} from "@/utils/image-translation/generated"
import {
  imageEditModel,
  imageEditQuality,
  imageEditOutputSize,
  imageEditInstructions,
  MAX_IMAGE_EDIT_INSTRUCTIONS,
} from "@/utils/image-translation/generated-schema"
import { PdfImageCost } from "./image-cost"
import { archiveImagePages, assembleImagePdf, renderImagePage } from "./image-pages"
import { MAX_PDF_IMAGE_PAGES, PdfImageSession } from "./image-session"
import { PdfPageRange, readPageRange } from "./page-range"

export function PdfImageTranslation({
  pdf,
  viewport,
  id,
  isCurrent,
}: {
  pdf: PDFDocumentProxy
  viewport: PdfViewport
  id: string
  isCurrent: () => boolean
}) {
  const [open, setOpen] = useState(false)
  const [session] = useState(() => new PdfImageSession())
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const [from, setFrom] = useState(String(viewport.snapshot().page)),
    [to, setTo] = useState("")
  const [model, setModel] = useState<ImageEditRequest["model"]>(
    () =>
      imageEditModel.safeParse(getFeatureModelSync("imageEdit")?.model).data ??
      "gpt-image-2.6-sunburst",
  )
  const [quality, setQuality] = useState<ImageEditRequest["quality"]>("high")
  const [instructions, setInstructions] = useState("")
  const [outputSize, setOutputSize] = useState<NonNullable<ImageEditRequest["outputSize"]>>("2k")
  const [dpi, setDpi] = useState(200),
    [selected, setSelected] = useState(0),
    [zoom, setZoom] = useState("fit")
  const [exporting, setExporting] = useState(false),
    [message, setMessage] = useState("")
  const [language, setLanguage] = useAtom(configFieldsAtomMap.language)
  const { targetCode } = language
  const [languages] = useState(getTargetLanguageItems)
  const previousTarget = useRef(targetCode)
  const dialog = useRef<HTMLDialogElement>(null),
    exportJob = useRef<AbortController | null>(null)
  const links = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const releaseLinks = () => {
    for (const [url, timer] of links.current) {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
    }
    links.current.clear()
  }
  const cancelExport = () => {
    exportJob.current?.abort()
    exportJob.current = null
    setExporting(false)
  }
  const clear = () => {
    session.clear()
    clearGeneratedImages()
    cancelExport()
    releaseLinks()
    setSelected(0)
    setMessage("")
  }
  const close = () => {
    session.cancel()
    cancelExport()
    releaseLinks()
    dialog.current?.close()
    setOpen(false)
  }
  useEffect(() => {
    if (open) dialog.current?.showModal()
  }, [open])
  useEffect(() => {
    if (previousTarget.current !== targetCode) {
      previousTarget.current = targetCode
      clear()
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies, react-hooks/exhaustive-deps -- invalidate owned work only on an actual language change.
  }, [targetCode])
  useEffect(() => {
    const owned = links.current
    const abort = () => {
      session.cancel()
      exportJob.current?.abort()
    }
    window.addEventListener("pagehide", abort)
    return () => {
      window.removeEventListener("pagehide", abort)
      session.destroy()
      clearGeneratedImages()
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- owned job, not a DOM ref.
      exportJob.current?.abort()
      for (const [url, timer] of owned) {
        clearTimeout(timer)
        URL.revokeObjectURL(url)
      }
      owned.clear()
    }
  }, [session])
  const busy = state.busy || exporting
  const rows = state.order.flatMap((page) => {
    const value = state.rows[page]?.value
    return value ? [value] : []
  })
  const active = state.rows[selected]?.value ?? rows[0]
  const start = async () => {
    if (busy) return
    setMessage("")
    cancelExport()
    releaseLinks()
    try {
      const range = readPageRange(
        from,
        to,
        pdf.numPages,
        MAX_PDF_IMAGE_PAGES,
        viewport.snapshot().page,
      )
      const pages = Array.from({ length: range.last - range.first + 1 }, (_, i) => range.first + i)
      setSelected(pages[0]!)
      const rotation = viewport.getRotation()
      const extraInstructions = imageEditInstructions.parse(instructions)
      let capturedConfig: Config | undefined
      await session.run(pages, {
        scope: async (signal) => {
          const config = await getLocalConfig()
          capturedConfig = config
          const owner = await imageEditScope(config, signal)
          return {
            identity: JSON.stringify([
              id,
              rotation,
              dpi,
              model,
              quality,
              outputSize,
              owner.identity,
              sha256(extraInstructions),
            ]),
            current: async () => {
              if (!isCurrent())
                throw new DOMException("Tài liệu đã đổi; đã dừng tạo ảnh.", "AbortError")
              await owner.current()
              if (!isCurrent())
                throw new DOMException("Tài liệu đã đổi; đã dừng tạo ảnh.", "AbortError")
            },
          }
        },
        render: (page, signal) => renderImagePage(pdf, page, dpi, rotation, signal),
        generate: async (image, signal) => {
          if (!capturedConfig || !isCurrent())
            throw new DOMException("Tài liệu đã đổi; đã dừng tạo ảnh.", "AbortError")
          return generateTranslatedImage({
            image,
            config: capturedConfig,
            model,
            quality,
            extraInstructions,
            outputSize,
            signal,
            onStatus: () => {},
          })
        },
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dải trang chưa hợp lệ.")
    }
  }
  const download = async (kind: "pdf" | "zip") => {
    if (busy || !rows.length || exportJob.current) return
    const controller = new AbortController()
    exportJob.current = controller
    setExporting(true)
    setMessage("Đang ghép kết quả trên máy…")
    try {
      const blob =
        kind === "pdf"
          ? await assembleImagePdf(rows, controller.signal)
          : await archiveImagePages(rows, controller.signal)
      controller.signal.throwIfAborted()
      if (exportJob.current !== controller || !isCurrent()) return
      while (links.current.size >= 2) {
        const url = links.current.keys().next().value!
        clearTimeout(links.current.get(url))
        URL.revokeObjectURL(url)
        links.current.delete(url)
      }
      const url = URL.createObjectURL(blob)
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url)
        links.current.delete(url)
      }, 60_000)
      links.current.set(url, timer)
      const link = document.createElement("a")
      link.href = url
      link.download = `FlowRead-anh-dich-${rows.map((row) => row.page).join("-")}.${kind}`
      link.click()
      setMessage(
        `Đã tạo ${kind.toUpperCase()} gồm ${rows.length} trang đã xong, theo thứ tự hiển thị. Không gọi thêm API.`,
      )
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(error instanceof Error ? error.message : "Chưa xuất được kết quả.")
    } finally {
      if (exportJob.current === controller) {
        exportJob.current = null
        setExporting(false)
      }
    }
  }
  const statusLabel = {
    queued: "Chờ",
    rendering: "Tạo ảnh nguồn",
    generating: "OpenAI đang dịch",
    done: "Đã xong",
    error: "Lỗi",
  }
  return (
    <>
      <button type="button" aria-label="Tạo PDF ảnh dịch" onClick={() => setOpen(true)}>
        <FileImage size={17} /> Tạo PDF ảnh dịch
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="rf-pdf-image-dialog"
          aria-labelledby="pdf-image-title"
          onCancel={(e) => {
            e.preventDefault()
            close()
          }}
        >
          <header className="rf-pdf-image-heading">
            <div>
              <FileImage size={22} />
              <div>
                <h2 id="pdf-image-title">Tạo PDF ảnh dịch</h2>
                <p>OpenAI dịch trực tiếp trên ảnh từng trang</p>
              </div>
            </div>
            <button type="button" aria-label="Đóng PDF ảnh dịch" onClick={close}>
              <X size={20} />
            </button>
          </header>
          <div className="rf-pdf-image-layout">
            <aside className="rf-pdf-image-settings">
              <h3>Độ nét nhanh</h3>
              <div className="rf-pdf-image-presets">
                {(
                  [
                    { label: "Nhanh", dpi: 144, size: "1k", quality: "medium" },
                    { label: "Rõ nét", dpi: 200, size: "2k", quality: "high" },
                    { label: "Chi tiết cao", dpi: 300, size: "4k", quality: "max" },
                  ] as const
                ).map((preset) => (
                  <button
                    type="button"
                    key={preset.label}
                    disabled={busy}
                    aria-pressed={
                      dpi === preset.dpi && outputSize === preset.size && quality === preset.quality
                    }
                    onClick={() => {
                      if (
                        dpi !== preset.dpi ||
                        outputSize !== preset.size ||
                        quality !== preset.quality
                      ) {
                        clear()
                        setDpi(preset.dpi)
                        setOutputSize(preset.size)
                        setQuality(preset.quality)
                      }
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <h3>Trang cần dịch</h3>
              <PdfPageRange
                from={from}
                to={to}
                onFrom={setFrom}
                onTo={setTo}
                total={pdf.numPages}
                disabled={busy}
                prefix="PDF ảnh dịch"
              />
              <p>Tối đa 20 trang/lượt · gửi tuần tự từng ảnh.</p>
              <label className="rf-pdf-image-language">
                Ngôn ngữ dịch{" "}
                <select
                  aria-label="Ngôn ngữ PDF ảnh dịch"
                  value={targetCode}
                  onChange={(e) =>
                    void setLanguage({ targetCode: languageTagSchema.parse(e.target.value) })
                  }
                >
                  {languages.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Model tạo ảnh{" "}
                <select
                  aria-label="Model PDF ảnh dịch"
                  value={model}
                  disabled={busy}
                  onChange={(e) => {
                    clear()
                    setModel(imageEditModel.parse(e.target.value))
                  }}
                >
                  <option value="gpt-image-2.6-sunburst">GPT Image 2.6 Sunburst</option>
                  <option value="gpt-image-2.6-flare">GPT Image 2.6 Flare</option>
                  <option value="gpt-image-2.5-sunburst">GPT Image 2.5 Sunburst</option>
                </select>
              </label>
              <div className="rf-pdf-image-pair">
                <label>
                  Chất lượng{" "}
                  <select
                    aria-label="Chất lượng PDF ảnh dịch"
                    value={quality}
                    disabled={busy}
                    onChange={(e) => {
                      clear()
                      setQuality(imageEditQuality.parse(e.target.value))
                    }}
                  >
                    <option value="high">Cao</option>
                    <option value="xhigh">Rất cao</option>
                    <option value="max">Tối đa</option>
                    <option value="medium">Vừa</option>
                    <option value="low">Thấp</option>
                  </select>
                </label>
                <label>
                  Ảnh nguồn{" "}
                  <select
                    aria-label="DPI PDF ảnh dịch"
                    value={dpi}
                    disabled={busy}
                    onChange={(e) => {
                      clear()
                      setDpi(Number(e.target.value))
                    }}
                  >
                    <option value={96}>96 DPI</option>
                    <option value={144}>144 DPI</option>
                    <option value={200}>200 DPI</option>
                    <option value={300}>300 DPI</option>
                  </select>
                </label>
              </div>
              <label>
                Kích thước ảnh đầu ra{" "}
                <select
                  aria-label="Kích thước PDF ảnh dịch"
                  value={outputSize}
                  disabled={busy}
                  onChange={(e) => {
                    clear()
                    setOutputSize(imageEditOutputSize.parse(e.target.value))
                  }}
                >
                  <option value="auto">Tự động</option>
                  <option value="1k">1K — khoảng 1 MP</option>
                  <option value="2k">2K — khoảng 4 MP</option>
                  <option value="4k">4K — tối đa 8 MP (thử nghiệm)</option>
                </select>
              </label>
              <p>
                Kích thước lớn tăng số pixel; chất lượng cao tăng chi tiết và có thể tăng phí/thời
                gian. Mức 2K/4K có thể còn thử nghiệm theo API, tối đa cạnh 3.840 px; không phóng
                lớn ảnh trả về để giả tăng độ nét.
              </p>
              <PdfImageCost
                pdf={pdf}
                from={from}
                to={to}
                fallback={viewport.snapshot().page}
                rotation={viewport.getRotation()}
                dpi={dpi}
                model={model}
                quality={quality}
                outputSize={outputSize}
              />
              <label>
                <span className="rf-pdf-image-prompt-caption">
                  Yêu cầu bổ sung{" "}
                  <small>
                    {instructions.length}/{MAX_IMAGE_EDIT_INSTRUCTIONS}
                  </small>
                </span>
                <textarea
                  aria-label="Yêu cầu bổ sung PDF ảnh dịch"
                  value={instructions}
                  maxLength={MAX_IMAGE_EDIT_INSTRUCTIONS}
                  disabled={busy}
                  spellCheck={false}
                  placeholder="Ví dụ: Giữ nguyên thuật ngữ RTL, STA, clock tree. Dịch ngắn gọn; giữ nguyên công thức và số liệu."
                  onChange={(e) => {
                    const value = e.target.value
                    if (
                      imageEditInstructions.parse(value) !==
                      imageEditInstructions.parse(instructions)
                    )
                      clear()
                    setInstructions(value)
                  }}
                />
              </label>
              <p>
                Không bắt buộc · gửi cùng mỗi trang khi bấm Tạo. Sửa yêu cầu sẽ xóa ảnh kết quả đang
                giữ; chưa gọi API. Nội dung chỉ nhớ trong tài liệu đang mở.
              </p>
              <p>
                Ảnh nguồn tự giới hạn 8 MP / cạnh 4.096 px. Chữ nhỏ có thể bị sai; OpenAI có thể đổi
                font hoặc chi tiết.
              </p>
              <div className="rf-pdf-image-notice">
                Có phí tạo ảnh riêng cho từng trang. Gửi <strong>toàn bộ ảnh trang gốc</strong>, kể
                cả phần đã loại trừ trong dịch theo đoạn. Không gửi file PDF hoặc ghi chú/nét vẽ
                riêng của FlowRead.
              </div>
              <button
                type="button"
                className="rf-pdf-image-primary"
                disabled={busy}
                onClick={() => void start()}
              >
                {rows.length ? "Tạo / tiếp tục trang còn thiếu" : "Tạo ảnh dịch các trang"}
              </button>
              {busy && (
                <button
                  type="button"
                  onClick={() => {
                    session.cancel()
                    cancelExport()
                  }}
                >
                  Dừng
                </button>
              )}
              <button type="button" disabled={busy || !state.order.length} onClick={clear}>
                Xóa ảnh trong phiên
              </button>
              <p>
                Ảnh chỉ giữ trong tab này, tối đa 20 ảnh / 96 MiB; đóng tab sẽ mất. Mở lại khung
                hoặc bấm tạo lại cùng cấu hình dùng các trang đã xong, không gọi API lại.
              </p>
            </aside>
            <section className="rf-pdf-image-results" aria-label="Kết quả PDF ảnh dịch">
              <div className="rf-pdf-image-progress" role="status" aria-live="polite">
                {message ||
                  state.message ||
                  "Chọn dải trang rồi bấm tạo. Chưa gửi nội dung tới OpenAI."}
              </div>
              <nav className="rf-pdf-image-pages" aria-label="Các ảnh trang đã dịch">
                {state.order.map((page) => {
                  const row = state.rows[page]
                  return (
                    <button
                      type="button"
                      key={page}
                      aria-pressed={active?.page === page}
                      data-page={page}
                      data-status={row?.status}
                      onClick={() => setSelected(page)}
                    >
                      {row?.status === "done" ? (
                        <Check size={14} />
                      ) : row?.status === "generating" || row?.status === "rendering" ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        <FileImage size={14} />
                      )}
                      Trang {page}
                      <small>{row ? statusLabel[row.status] : "Chờ"}</small>
                    </button>
                  )
                })}
              </nav>
              <div className="rf-pdf-image-preview-toolbar">
                <span>
                  {active
                    ? `Trang ${active.page} · ${active.result.width} × ${active.result.height} px`
                    : "Xem ảnh OpenAI trả về"}
                </span>
                <select
                  aria-label="Thu phóng PDF ảnh dịch"
                  value={zoom}
                  onChange={(e) => setZoom(e.target.value)}
                >
                  <option value="fit">Vừa khung</option>
                  <option value="100">100% — pixel gốc</option>
                  <option value="150">150%</option>
                </select>
                {active && (
                  <a href={active.result.image} download={`FlowRead-trang-${active.page}.png`}>
                    <Download size={15} /> PNG trang {active.page}
                  </a>
                )}
              </div>
              <div className="rf-pdf-image-preview">
                {active ? (
                  <img
                    src={active.result.image}
                    alt={`Ảnh dịch trang ${active.page} từ OpenAI`}
                    style={{
                      width: zoom === "fit" ? "100%" : (active.result.width * Number(zoom)) / 100,
                      maxWidth: zoom === "fit" ? active.result.width : "none",
                    }}
                  />
                ) : (
                  <div className="rf-pdf-image-empty">
                    <Images size={42} />
                    <h3>Ảnh dịch sẽ hiện ở đây</h3>
                    <p>
                      Mỗi trang là một ảnh do OpenAI tạo. Có thể chọn xem từng trang, tải PNG/ZIP
                      hoặc ghép thành PDF ngay trên máy.
                    </p>
                  </div>
                )}
              </div>
              <footer className="rf-pdf-image-export">
                <button
                  type="button"
                  disabled={busy || !rows.length}
                  onClick={() => void download("pdf")}
                >
                  <FileDown size={17} /> Tải PDF ({rows.length} trang xong)
                </button>
                <button
                  type="button"
                  disabled={busy || !rows.length}
                  onClick={() => void download("zip")}
                >
                  <Images size={17} /> Tải ZIP ảnh
                </button>
                <p>
                  PDF ảnh giữ khổ trang gốc, không có lớp chữ để tìm kiếm. Chỉ xuất các trang đã
                  xong; thao tác xem/tải không gọi AI.
                </p>
              </footer>
            </section>
          </div>
        </dialog>
      )}
    </>
  )
}
