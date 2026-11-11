import type { PDFDocumentProxy } from "pdfjs-dist"
import type { Ref } from "react"
import type { PdfParagraph } from "./paragraphs"
import type { PdfViewport } from "./viewport"
import type { Config } from "@/types/config/config"
import type { PdfDocument } from "@/utils/selection-result/pdf-history"
import type { PdfTextOptions } from "@/utils/selection-result/pdf-text"
import { useAtom, useAtomValue } from "jotai"
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { getTargetLanguageItems } from "@/components/language-combobox-options"
import { CopyButton } from "@/components/ui/selection-popover/copy-button"
import { ReadingLabButton } from "@/components/ui/selection-popover/reading-lab-button"
import { SpeakButton } from "@/components/ui/selection-popover/speak-button"
import { configAtom, configFieldsAtomMap } from "@/utils/atoms/config"
import { getLocalConfig } from "@/utils/config/storage"
import { sendMessage } from "@/utils/message"
import { getPdfHistoryEpoch } from "@/utils/selection-result/pdf-history"
import { PdfBatchTranslation } from "./batch-translation"
import { PdfBilingualSession, translationConfigIdentity } from "./bilingual-session"
import { mergeParagraphs, splitParagraph } from "./paragraph-edits"

export interface PdfBilingualHandle {
  translatePage: () => void
}
interface Context {
  revision: number
  configured: boolean
  epoch: number
  glossary: number | string
}
async function readContext(
  document: PdfDocument,
  config: Config,
  glossary: boolean,
  previous?: Context | null,
): Promise<Context> {
  const [status, epoch, snapshot] = await Promise.all([
    sendMessage("getOpenAIKeyStatus"),
    getPdfHistoryEpoch(document),
    glossary && config.glossary.enabled
      ? sendMessage("getGlossarySnapshot", {
          url: undefined,
          targetLang: config.language.targetCode,
        })
      : Promise.resolve(null),
  ])
  return {
    revision: status.revision,
    configured: status.configured,
    epoch,
    glossary: snapshot?.revision ?? previous?.glossary ?? 0,
  }
}
function LanguageChoice() {
  const [language, setLanguage] = useAtom(configFieldsAtomMap.language),
    items = useMemo(() => getTargetLanguageItems(), [])
  return (
    <select
      aria-label="Ngôn ngữ PDF song ngữ"
      value={language.targetCode}
      onChange={(event) => {
        const item = items.find((option) => option.value === event.target.value)
        if (item) void setLanguage({ targetCode: item.value })
      }}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  )
}
export function PdfBilingualPane({
  viewport,
  pdf,
  document,
  pageCount,
  ref,
  onBusy,
  textOptions,
}: {
  viewport: PdfViewport
  pdf: PDFDocumentProxy
  document: PdfDocument
  pageCount: number
  ref?: Ref<PdfBilingualHandle>
  onBusy: (busy: boolean) => void
  textOptions: PdfTextOptions
}) {
  const config = useAtomValue(configAtom),
    identity = useMemo(
      () => JSON.stringify([translationConfigIdentity(config), textOptions]),
      [config, textOptions],
    ),
    [context, setContext] = useState<Context | null>(null),
    [error, setError] = useState("")
  const contextRef = useRef<Context | null>(null)
  const documentId = document.id,
    documentTitle = document.title
  const refreshContext = useRef<() => void>(() => {})
  const invalidate = useCallback(() => refreshContext.current(), [])
  useEffect(() => {
    viewport.paragraphs.enable(true)
    return () => viewport.paragraphs.enable(false)
  }, [viewport])
  useEffect(() => {
    let active = true,
      pending = false
    const check = async (glossary = false) => {
      if (pending || !active) return
      pending = true
      try {
        const next = await readContext(
          { id: documentId, title: documentTitle },
          config,
          glossary,
          contextRef.current,
        )
        if (active) {
          contextRef.current = next
          setContext((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next))
          setError("")
        }
      } catch {
        if (active)
          setError("Chưa đọc được cấu hình/cache trên máy. Có thể đóng/mở lại chế độ song ngữ.")
      } finally {
        pending = false
      }
    }
    void check(true)
    const focus = () => {
        void check(true)
      },
      visibility = () => {
        if (window.document.visibilityState === "visible") focus()
      }
    refreshContext.current = focus
    const timer = setInterval(() => {
      if (window.document.visibilityState === "visible") void check()
    }, 5000)
    window.addEventListener("focus", focus)
    window.document.addEventListener("visibilitychange", visibility)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener("focus", focus)
      window.document.removeEventListener("visibilitychange", visibility)
    }
  }, [config, documentId, documentTitle])
  const snapshot = useSyncExternalStore(
    viewport.paragraphs.subscribe,
    viewport.paragraphs.getSnapshot,
  )
  return (
    <aside className="rf-reader-bilingual" aria-label="Bản dịch PDF theo đoạn">
      <header className="rf-bilingual-heading">
        <strong>BẢN DỊCH</strong>
        <LanguageChoice />
      </header>
      {error && (
        <p role="alert" className="rf-bilingual-note">
          {error}
        </p>
      )}
      {context ? (
        <BilingualWorkspace
          key={JSON.stringify([identity, context])}
          ref={ref}
          viewport={viewport}
          pdf={pdf}
          document={document}
          pageCount={pageCount}
          config={config}
          context={context}
          textOptions={textOptions}
          onInvalidate={invalidate}
          onBusy={onBusy}
        />
      ) : (
        <p className="rf-bilingual-note">Đang đọc cache và cấu hình…</p>
      )}
      {snapshot.status === "loading" && (
        <p className="rf-bilingual-note">Đang nhận diện đoạn trên trang {snapshot.page}…</p>
      )}
    </aside>
  )
}
function BilingualWorkspace({
  viewport,
  pdf,
  document,
  pageCount,
  config,
  context,
  ref,
  onInvalidate,
  onBusy,
  textOptions,
}: {
  viewport: PdfViewport
  pdf: PDFDocumentProxy
  document: PdfDocument
  pageCount: number
  config: Config
  context: Context
  ref?: Ref<PdfBilingualHandle>
  onInvalidate: () => void
  onBusy: (busy: boolean) => void
  textOptions: PdfTextOptions
}) {
  const [sync, setSync] = useState(true),
    [editing, setEditing] = useState(false),
    pane = useRef<HTMLDivElement>(null),
    mutedUntil = useRef(0),
    userUntil = useRef(0),
    turnUntil = useRef(0)
  const workspace = useSyncExternalStore(
    viewport.workspace.subscribe,
    viewport.workspace.getSnapshot,
  )
  const snapshot = useSyncExternalStore(
    viewport.paragraphs.subscribe,
    viewport.paragraphs.getSnapshot,
  )
  const createSession = () =>
    new PdfBilingualSession(
      config,
      document,
      async () => {
        const [current, next] = await Promise.all([
          getLocalConfig(),
          readContext(document, config, true),
        ])
        return (
          translationConfigIdentity(current) === translationConfigIdentity(config) &&
          JSON.stringify(next) === JSON.stringify(context)
        )
      },
      onInvalidate,
      undefined,
      textOptions,
    )
  const [session] = useState(createSession)
  const [batchBusy, setBatchBusy] = useState(false)
  const translations = useSyncExternalStore(session.subscribe, session.getSnapshot)
  useEffect(() => () => session.destroy(), [session])
  useEffect(() => {
    session.setPage(snapshot.page, snapshot.paragraphs)
    if (snapshot.status === "ready") void session.restoreCache()
  }, [session, snapshot.page, snapshot.paragraphs, snapshot.status])
  useEffect(() => {
    onBusy(translations.busy || batchBusy)
    return () => onBusy(false)
  }, [onBusy, translations.busy, batchBusy])
  useImperativeHandle(
    ref,
    () => ({
      translatePage: () => {
        if (context.configured && workspace.ready && !workspace.busy && !batchBusy)
          void session.translatePage()
      },
    }),
    [session, context.configured, workspace.ready, workspace.busy, batchBusy],
  )
  useLayoutEffect(() => {
    if (
      (!sync && snapshot.origin !== "pick") ||
      snapshot.origin === "pane" ||
      !snapshot.activeId ||
      !pane.current
    )
      return
    const node = [...pane.current.querySelectorAll<HTMLElement>("[data-translation-id]")].find(
      (item) => item.dataset.translationId === snapshot.activeId,
    )
    if (!node) return
    if (
      translations.rows[snapshot.activeId]?.status === "loading" &&
      performance.now() < userUntil.current
    )
      return
    mutedUntil.current = performance.now() + 160
    pane.current.scrollTop =
      node.offsetTop + snapshot.progress * node.offsetHeight - pane.current.clientHeight * 0.15
  }, [sync, snapshot.activeId, snapshot.progress, snapshot.origin, translations.rows])
  const userScroll = () => {
    const host = pane.current
    if (
      !sync ||
      !host ||
      performance.now() < mutedUntil.current ||
      performance.now() > userUntil.current
    )
      return
    const position = host.scrollTop + host.clientHeight * 0.15,
      nodes = [...host.querySelectorAll<HTMLElement>("[data-translation-id]")]
    const node =
      nodes.find(
        (item) => position >= item.offsetTop && position <= item.offsetTop + item.offsetHeight,
      ) ??
      nodes.reduce<HTMLElement | null>(
        (best, item) =>
          !best || Math.abs(item.offsetTop - position) < Math.abs(best.offsetTop - position)
            ? item
            : best,
        null,
      )
    if (node)
      viewport.paragraphs.select(
        node.dataset.translationId!,
        true,
        Math.max(0, Math.min(1, (position - node.offsetTop) / node.offsetHeight)),
      )
  }
  return (
    <>
      <div className="rf-bilingual-controls">
        <span>
          Trang {snapshot.page} · {snapshot.paragraphs.length} đoạn
        </span>
        <label>
          <input
            type="checkbox"
            checked={sync}
            onChange={(event) => setSync(event.target.checked)}
          />
          Cuộn cùng nhau
        </label>
        <button type="button" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
          Chỉnh đoạn
        </button>
        {editing && (
          <button
            type="button"
            disabled={workspace.busy}
            onClick={() => void viewport.paragraphs.changeLayout(null)}
          >
            Khôi phục chia tự động
          </button>
        )}
        {translations.busy && (
          <button type="button" onClick={() => session.cancel()}>
            Dừng dịch
          </button>
        )}
      </div>
      <PdfBatchTranslation
        pdf={pdf}
        viewport={viewport}
        createSession={createSession}
        configured={context.configured && workspace.ready && !workspace.busy}
        onBusy={(value) => {
          if (value) session.cancel()
          setBatchBusy(value)
        }}
        onComplete={() => void session.restoreCache()}
      />
      {!context.configured && (
        <p className="rf-bilingual-note">
          Lưu API key trong OpenAI Settings để dịch. Mở hoặc cuộn không gọi API.
        </p>
      )}
      {translations.message && (
        <p className="rf-bilingual-note" role="status">
          {translations.message}
        </p>
      )}
      <div
        ref={pane}
        className="rf-bilingual-scroll"
        aria-label="Các đoạn dịch"
        tabIndex={0}
        onScroll={userScroll}
        onPointerDown={() => {
          userUntil.current = performance.now() + 3000
          mutedUntil.current = 0
        }}
        onKeyDown={() => {
          userUntil.current = performance.now() + 1500
          mutedUntil.current = 0
        }}
        onWheel={(event) => {
          userUntil.current = performance.now() + 1500
          mutedUntil.current = 0
          const host = event.currentTarget,
            next = event.deltaY > 0 && host.scrollTop + host.clientHeight >= host.scrollHeight - 2,
            previous = event.deltaY < 0 && host.scrollTop <= 2
          if (
            sync &&
            performance.now() > turnUntil.current &&
            ((next && snapshot.page < pageCount) || (previous && snapshot.page > 1))
          ) {
            turnUntil.current = performance.now() + 700
            viewport.navigate(snapshot.page + (next ? 1 : -1))
          }
        }}
      >
        {snapshot.status === "ready" && !snapshot.paragraphs.length && (
          <p className="rf-bilingual-note">{snapshot.message}</p>
        )}
        {snapshot.paragraphs.map((paragraph) => {
          const row = translations.rows[paragraph.id],
            complete = row?.status === "done" || !!row?.complete
          return (
            <article
              key={paragraph.id}
              data-translation-id={paragraph.id}
              className={`rf-bilingual-card ${snapshot.activeId === paragraph.id ? "active" : ""} ${paragraph.excluded ? "excluded" : ""}`}
            >
              <header>
                <button
                  type="button"
                  aria-label={`Chọn bản dịch đoạn ${paragraph.index + 1}`}
                  aria-pressed={snapshot.activeId === paragraph.id}
                  onClick={() => viewport.paragraphs.select(paragraph.id, sync)}
                >
                  {String(paragraph.index + 1).padStart(2, "0")}
                </button>
                <button
                  type="button"
                  disabled={
                    translations.busy ||
                    !context.configured ||
                    !!paragraph.excluded ||
                    workspace.busy
                  }
                  onClick={() => void session.translatePage(paragraph.id, !!row?.complete)}
                >
                  {row?.complete ? "Dịch lại" : "Dịch đoạn"}
                </button>
              </header>
              {editing && (
                <ParagraphEditor
                  paragraph={paragraph}
                  paragraphs={snapshot.paragraphs}
                  viewport={viewport}
                  busy={workspace.busy}
                />
              )}
              {paragraph.excluded && (
                <p className="rf-bilingual-note">
                  Đã bỏ qua khi dịch. Bật Chỉnh đoạn để khôi phục.
                </p>
              )}
              <details>
                <summary>Đoạn gốc</summary>
                <p className="rf-bilingual-original">{paragraph.text}</p>
                <div className="rf-bilingual-actions">
                  <CopyButton text={paragraph.text} />
                  <SpeakButton text={paragraph.text} />
                </div>
              </details>
              {!paragraph.excluded &&
                (row?.output ? (
                  <p className="rf-bilingual-output" aria-live="polite">
                    {row.output}
                    {row.status === "loading" ? " ●" : ""}
                  </p>
                ) : (
                  <p className="rf-bilingual-placeholder">
                    {row?.status === "loading"
                      ? "Đang dịch…"
                      : "Bấm Dịch đoạn hoặc Dịch trang đang xem."}
                  </p>
                ))}
              {row?.error && (
                <p role="alert" className="rf-bilingual-error">
                  {row.error}
                </p>
              )}
              {row?.cacheNote && <p className="rf-bilingual-note">{row.cacheNote}</p>}
              {complete && !paragraph.excluded && (
                <div className="rf-bilingual-actions">
                  <CopyButton text={row.complete} />
                  <SpeakButton text={row.complete} />
                  <ReadingLabButton
                    original={paragraph.text}
                    translation={row.complete}
                    title={document.title}
                  />
                </div>
              )}
            </article>
          )
        })}
      </div>
      <p className="rf-bilingual-note">
        {snapshot.paragraphs.length
          ? snapshot.message
          : "Chỉ các đoạn được yêu cầu mới gửi tới OpenAI; không upload PDF."}
      </p>
    </>
  )
}

function ParagraphEditor({
  paragraph,
  paragraphs,
  viewport,
  busy,
}: {
  paragraph: PdfParagraph
  paragraphs: PdfParagraph[]
  viewport: PdfViewport
  busy: boolean
}) {
  const input = useRef<HTMLTextAreaElement>(null)
  const change = (make: () => PdfParagraph[]) => {
    try {
      void viewport.paragraphs.changeLayout(make())
    } catch (error) {
      viewport.workspace.fail(error)
    }
  }
  return (
    <div className="rf-paragraph-editor">
      <textarea
        ref={input}
        readOnly
        aria-label={`Chỗ tách đoạn ${paragraph.index + 1}`}
        value={paragraph.text}
      />
      <small>Đặt con trỏ trong chữ phía trên rồi bấm Tách. Chữ PDF gốc được giữ nguyên.</small>
      <div>
        <button
          type="button"
          disabled={busy || !!paragraph.excluded}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() =>
            change(() =>
              splitParagraph(paragraphs, paragraph.id, input.current?.selectionStart ?? 0),
            )
          }
        >
          Tách tại con trỏ
        </button>
        <button
          type="button"
          disabled={
            busy ||
            !!paragraph.excluded ||
            paragraph.index >= paragraphs.length - 1 ||
            !!paragraphs[paragraph.index + 1]?.excluded
          }
          onClick={() => change(() => mergeParagraphs(paragraphs, paragraph.id))}
        >
          Gộp với đoạn sau
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            change(() =>
              paragraphs.map((p) => (p.id === paragraph.id ? { ...p, excluded: !p.excluded } : p)),
            )
          }
        >
          {paragraph.excluded ? "Cho dịch lại đoạn này" : "Bỏ qua đoạn này"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => change(() => paragraphs.filter((p) => p.id !== paragraph.id))}
        >
          Xóa phần nhận diện
        </button>
      </div>
    </div>
  )
}
