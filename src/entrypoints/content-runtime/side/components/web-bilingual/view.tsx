import type { WebPair } from "@/utils/host/translate/web-bilingual-pairs"
import { useAtomValue } from "jotai"
import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { CopyButton } from "@/components/ui/selection-popover/copy-button"
import { ReadingLabButton } from "@/components/ui/selection-popover/reading-lab-button"
import { SpeakButton } from "@/components/ui/selection-popover/speak-button"
import { webBilingualPairs as pairs } from "@/utils/host/translate/web-bilingual-pairs"
import { sendMessage } from "@/utils/message"
import { enablePageTranslationAtom } from "../../atoms"
import { WebBilingualLink } from "./link"
import css from "./style.css?inline"

const PairCard = memo(function PairCard({
  row,
  index,
  active,
  select,
}: {
  row: WebPair
  index: number
  active: boolean
  select: (id: string) => void
}) {
  return (
    <article className={`rf-web-pair ${active ? "active" : ""}`} data-web-pair={row.id}>
      <header>
        <button type="button" aria-pressed={active} onClick={() => select(row.id)}>
          Đoạn {String(index + 1).padStart(2, "0")} · Đến đoạn trên trang
        </button>
      </header>
      <p className="rf-web-source" dir="auto">
        {row.original}
      </p>
      <p className="rf-web-output" dir="auto">
        {row.translation}
      </p>
      {active && (
        <div className="rf-web-actions">
          <span>Gốc</span>
          <CopyButton text={row.original} />
          <SpeakButton text={row.original} />
          <span>Dịch</span>
          <CopyButton text={row.translation} />
          <SpeakButton text={row.translation} />
          <ReadingLabButton
            original={row.original}
            translation={row.translation}
            title={document.title}
          />
        </div>
      )}
    </article>
  )
})
export default function WebBilingualView({ onClose }: { onClose: () => void }) {
  const snapshot = useSyncExternalStore(pairs.subscribe, pairs.getSnapshot),
    translation = useAtomValue(enablePageTranslationAtom),
    [sync, setSync] = useState(true),
    [reserve, setReserve] = useState(true),
    [collapsed, setCollapsed] = useState(false),
    [active, setActive] = useState<string | null>(null),
    [error, setError] = useState("")
  const root = useRef<HTMLDivElement>(null),
    pane = useRef<HTMLDivElement>(null),
    overlay = useRef<HTMLDivElement>(null),
    link = useRef<WebBilingualLink | null>(null)
  const choose = useCallback((id: string) => link.current?.select(id, true), [])
  useEffect(() => {
    pairs.prune()
    const refresh = () => {
      if (document.visibilityState === "visible") pairs.prune()
    }
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") pairs.prune()
    }, 750)
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [])
  useEffect(() => {
    if (collapsed || !root.current || !pane.current || !overlay.current) return undefined
    const connection = new WebBilingualLink(root.current, pane.current, overlay.current, setActive)
    link.current = connection
    return () => {
      link.current = null
      connection.destroy()
    }
  }, [collapsed])
  useEffect(() => {
    if (!collapsed) link.current?.setSync(sync)
  }, [sync, collapsed])
  useEffect(() => {
    if (!reserve || collapsed || !root.current) return undefined
    const style = document.createElement("style"),
      token = `rf-web-reserved-${Math.random().toString(36).slice(2)}`
    style.className = "notranslate"
    document.documentElement.classList.add(token)
    document.head.append(style)
    const update = () => {
      style.textContent = `@media screen and (min-width:1000px){html.${token}{margin-right:${Math.ceil(root.current?.getBoundingClientRect().width ?? 0) + 24}px!important}}`
    }
    const observer = new ResizeObserver(update)
    observer.observe(root.current)
    update()
    return () => {
      observer.disconnect()
      document.documentElement.classList.remove(token)
      style.remove()
    }
  }, [reserve, collapsed])
  return (
    <>
      <style>{css}</style>
      {!collapsed && <div ref={overlay} hidden className="rf-web-highlight" aria-hidden="true" />}
      <section
        ref={root}
        className={`rf-web-bilingual ${collapsed ? "collapsed" : ""}`}
        aria-label="Khung song ngữ HTML"
      >
        <header className="rf-web-heading">
          <strong>Read Frog · Song ngữ HTML</strong>
          <div>
            <button
              type="button"
              aria-label={collapsed ? "Mở rộng khung song ngữ" : "Thu gọn khung song ngữ"}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? "□" : "−"}
            </button>
            <button type="button" aria-label="Đóng khung song ngữ" onClick={onClose}>
              ×
            </button>
          </div>
        </header>
        {!collapsed && (
          <>
            <div className="rf-web-controls">
              <button
                type="button"
                data-web-translate
                onClick={() => {
                  setError("")
                  void sendMessage("tryToSetEnablePageTranslationOnContentScript", {
                    enabled: !translation.enabled,
                  }).catch(() =>
                    setError("Chưa đổi được trạng thái dịch. Tải lại trang rồi thử lại."),
                  )
                }}
              >
                {translation.enabled ? "Hiện bản gốc" : "Translate page"}
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={sync}
                  onChange={(event) => setSync(event.target.checked)}
                />
                Cuộn cùng nhau
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={reserve}
                  onChange={(event) => setReserve(event.target.checked)}
                />
                Chừa chỗ trên màn hình rộng
              </label>
            </div>
            <p className="rf-web-note">
              {snapshot.rows.length} đoạn · Dùng chung kết quả Translate page
            </p>
            {error && (
              <p role="alert" className="rf-web-note">
                {error}
              </p>
            )}
            <div
              ref={pane}
              className="rf-web-scroll"
              tabIndex={0}
              aria-label="Các đoạn song ngữ HTML"
            >
              {!snapshot.rows.length && (
                <p className="rf-web-empty">
                  Bấm Translate page để dịch. Các đoạn hoàn thành sẽ xuất hiện ở đây. Cuộn bài để
                  engine dịch tiếp như bình thường. Mở khung không gọi thêm OpenAI.
                </p>
              )}
              {snapshot.rows.map((row, index) => (
                <PairCard
                  key={row.id}
                  row={row}
                  index={index}
                  active={row.id === active}
                  select={choose}
                />
              ))}
            </div>
            <p className="rf-web-note">
              {snapshot.limited
                ? "Khung có giới hạn 400 đoạn / 2 Mi ký tự và bỏ qua đoạn quá phức tạp; bản dịch trên trang vẫn giữ nguyên."
                : "Chọn số đoạn để đối chiếu và hiện Copy, loa, MP3, Lưu đoạn. Bấm chỗ khác vẫn giữ khung."}
            </p>
          </>
        )}
      </section>
    </>
  )
}
