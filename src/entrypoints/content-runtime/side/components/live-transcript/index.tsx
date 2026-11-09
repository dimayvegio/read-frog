import type { LangCodeISO6393 } from "@read-frog/definitions"
import type { SourceView, SourceSnapshot } from "@/utils/audio-transcription/source-view"
import type { SidebarResizeEdge } from "@/utils/subtitles/sidebar-window"
import {
  LANG_CODE_TO_EN_NAME,
  LANG_CODE_TO_LOCALE_NAME,
  langCodeISO6393Schema,
} from "@read-frog/definitions"
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { browser } from "#imports"
import { useSidebarWindow } from "@/entrypoints/subtitles.content/ui/subtitles-sidebar/use-sidebar-window"
import {
  liveTranscriptSourceURL,
  sourceSnapshotSchema,
} from "@/utils/audio-transcription/source-view"
import { onMessage, sendMessage } from "@/utils/message"
import {
  createReactShadowHost,
  removeReactShadowHost,
} from "@/utils/react-shadow-host/create-shadow-host"
import style from "./style.css?inline"

const HOST_ID = "read-frog-live-transcript"
const STORAGE_KEY = "liveTranscriptWindowV1"
const targets = [
  "eng",
  "vie",
  ...langCodeISO6393Schema.options.filter((code) => code !== "eng" && code !== "vie"),
] as LangCodeISO6393[]
function isNativeFullscreen() {
  return Boolean(
    document.fullscreenElement &&
    ["IFRAME", "VIDEO", "AUDIO", "EMBED", "OBJECT", "CANVAS", "IMG"].includes(
      document.fullscreenElement.tagName,
    ),
  )
}
function makeStore(initial: SourceView) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (next: SourceView) => {
      value = next
      listeners.forEach((listener) => listener())
    },
  }
}
const edges: SidebarResizeEdge[] = ["n", "s", "w", "e", "nw", "ne", "sw", "se"]
function Pane({ store, onClose }: { store: ReturnType<typeof makeStore>; onClose: () => void }) {
  const view = useSyncExternalStore(store.subscribe, store.get)
  const { rootRef, helpId, start, move, end, key, reset } = useSidebarWindow(STORAGE_KEY)
  const [compact, setCompact] = useState(false),
    [fontSize, setFontSize] = useState(18),
    [following, setFollowing] = useState(true),
    [message, setMessage] = useState("")
  const scroller = useRef<HTMLDivElement>(null)
  const [readOnly, setReadOnly] = useState(isNativeFullscreen)
  useLayoutEffect(() => {
    const update = () => {
      const native = isNativeFullscreen()
      setReadOnly(native)
      if (native) setFollowing(true)
    }
    document.addEventListener("fullscreenchange", update)
    return () => document.removeEventListener("fullscreenchange", update)
  }, [])
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.style.fontSize = `${fontSize}px`
    if (
      following &&
      (!compact || readOnly) &&
      (view.text || view.pending || view.translation.rows.length) &&
      scroller.current
    )
      scroller.current.scrollTop = scroller.current.scrollHeight
  }, [view.text, view.pending, view.translation, following, compact, fontSize, readOnly])
  const translation = (enabled: boolean, target = view.translation.target, retry = false) => {
    void sendMessage("setTabAudioTranslation", {
      session: view.session,
      enabled,
      target,
      retry,
    }).catch(() => setMessage("Chưa đổi được chế độ dịch. Kiểm tra trang Audio và extension."))
  }
  const action = (command: "stop" | "audio") => {
    void sendMessage("tabAudioViewAction", { session: view.session, action: command })
      .then((ok) => {
        if (!ok) setMessage("Phiên chép lời đã kết thúc hoặc trang Audio đã đóng.")
      })
      .catch(() => setMessage("Kết nối extension đã ngắt. Mở lại popup Read Frog để kiểm tra."))
  }
  return (
    <div
      ref={rootRef}
      className="live-window"
      data-native-fullscreen={readOnly || undefined}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <section
        className="live-pane"
        aria-label="Chép lời trực tiếp của tab"
        style={{ height: compact && !readOnly ? "auto" : "100%" }}
      >
        <header onPointerDown={(event) => start(event, "move")}>
          <button
            type="button"
            hidden={readOnly}
            data-sidebar-move
            aria-label="Di chuyển khung chép lời"
            aria-describedby={helpId}
            onKeyDown={key}
          >
            ⠿
          </button>
          <strong>
            <span className={view.status === "listening" ? "live-dot listening" : "live-dot"} />
            Chép lời trực tiếp
          </strong>
          <button
            type="button"
            hidden={readOnly}
            title="Vị trí mặc định"
            aria-label="Đặt lại vị trí khung"
            onClick={reset}
          >
            ↺
          </button>
          <button
            type="button"
            hidden={readOnly}
            aria-label={compact ? "Mở rộng khung chép lời" : "Thu gọn khung chép lời"}
            aria-expanded={!compact}
            onClick={() => setCompact(!compact)}
          >
            {compact ? "＋" : "−"}
          </button>
          {view.status === "stopped" && !readOnly && (
            <button type="button" aria-label="Đóng khung chép lời" onClick={onClose}>
              ×
            </button>
          )}
        </header>
        <div className="live-body" hidden={compact && !readOnly}>
          {readOnly && (
            <small className="live-fullscreen-note">
              Đang xem lời · Nhấn Esc để điều khiển khung
            </small>
          )}
          <div className="live-toolbar" hidden={readOnly}>
            <button
              type="button"
              disabled={fontSize <= 14}
              aria-label="Chữ nhỏ hơn"
              onClick={() => setFontSize((value) => value - 2)}
            >
              A−
            </button>
            <button
              type="button"
              disabled={fontSize >= 30}
              aria-label="Chữ lớn hơn"
              onClick={() => setFontSize((value) => value + 2)}
            >
              A＋
            </button>
            <span>
              {view.status === "connecting"
                ? "Đang kết nối…"
                : view.status === "listening"
                  ? "● Đang nghe"
                  : view.status === "stopping"
                    ? "Đang chốt câu cuối…"
                    : "Đã dừng"}
            </span>
            <button
              type="button"
              disabled={view.status === "stopped" || view.status === "stopping"}
              onClick={() => action("stop")}
            >
              Dừng
            </button>
          </div>
          <div className="live-translation-controls" hidden={readOnly}>
            <label>
              <input
                type="checkbox"
                checked={view.translation.enabled}
                onChange={(event) => translation(event.target.checked)}
              />{" "}
              Dịch theo ngữ cảnh
            </label>
            <select
              aria-label="Ngôn ngữ bản dịch trực tiếp"
              value={view.translation.target}
              onChange={(event) =>
                translation(view.translation.enabled, event.target.value as LangCodeISO6393)
              }
            >
              {targets.map((code) => (
                <option key={code} value={code}>
                  {LANG_CODE_TO_LOCALE_NAME[code]} · {LANG_CODE_TO_EN_NAME[code]}
                </option>
              ))}
            </select>
            <small>Dịch đoạn đã chốt và phần gần nhất · OpenAI có tính phí riêng.</small>
            {view.translation.message && <small role="status">{view.translation.message}</small>}
            {view.translation.enabled && view.translation.failed && (
              <button
                type="button"
                onClick={() => translation(true, view.translation.target, true)}
              >
                Thử dịch lại
              </button>
            )}
          </div>
          <div
            ref={scroller}
            className="live-text"
            tabIndex={0}
            aria-label="Bản chép lời"
            onWheel={(event) => event.stopPropagation()}
            onScroll={() => {
              const el = scroller.current
              if (el) setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < 36)
            }}
          >
            {!view.text && !view.pending && (
              <p className="live-placeholder">
                {view.status === "stopped"
                  ? view.message
                  : "Lời nói sẽ hiện ở đây khi video đang phát."}
              </p>
            )}
            {view.text &&
              (view.translation.enabled ? (
                view.translation.rows.map((row) => (
                  <div className="live-pair" key={row.id} data-live-row={row.id}>
                    <p data-live-final>{row.source}</p>
                    <p className="live-translated" data-live-translation>
                      {row.translation || (row.state === "working" ? "Đang dịch…" : "Chờ dịch…")}
                    </p>
                  </div>
                ))
              ) : (
                <p data-live-final>{view.text}</p>
              ))}
            {view.pending && (
              <p className="live-pending" data-live-pending>
                {view.pending.slice(-4000)}
                <small>Đang nhận dạng · chưa chốt</small>
              </p>
            )}
          </div>
          {!following && !readOnly && (
            <button className="follow" type="button" onClick={() => setFollowing(true)}>
              ↓ Theo dõi chữ mới
            </button>
          )}
          <footer hidden={readOnly}>
            <div>
              <button type="button" onClick={() => action("audio")}>
                Mở Audio / Tải TXT ↗
              </button>
              <button
                type="button"
                disabled={!view.text && !view.pending}
                onClick={() => {
                  void navigator.clipboard
                    .writeText(
                      (view.translation.enabled
                        ? view.translation.rows
                            .map(
                              (row) => row.source + (row.translation ? "\n" + row.translation : ""),
                            )
                            .join("\n\n")
                        : view.text) + (view.pending ? "\n\n[CHƯA CHỐT]\n" + view.pending : ""),
                    )
                    .then(() => setMessage("Đã copy phần lời gần nhất trong khung."))
                    .catch(() => setMessage("Chưa copy được. Chọn văn bản và nhấn Ctrl+C."))
                }}
              >
                Copy khung
              </button>
            </div>
            <small>
              {message ||
                (view.status === "stopped"
                  ? view.message
                  : "Giữ tab Audio mở trong lúc nghe. Khung hiện phần lời gần nhất.")}
            </small>
          </footer>
        </div>
      </section>
      <span id={helpId} className="live-sr">
        Kéo thanh tiêu đề để di chuyển. Phím mũi tên di chuyển; Shift và mũi tên đổi kích thước.
      </span>
      {!compact &&
        !readOnly &&
        edges.map((edge) => (
          <button
            type="button"
            key={edge}
            className={`live-resize ${edge}`}
            data-live-resize={edge}
            tabIndex={-1}
            aria-label="Đổi kích thước khung chép lời"
            onPointerDown={(event) => start(event, edge)}
          />
        ))}
    </div>
  )
}

/** Passive, source-bound view. Opening it never starts capture or calls a provider. */
export function setupLiveTranscriptView() {
  if (window !== window.top || !liveTranscriptSourceURL(location.href)) return () => {}
  let host: HTMLElement | null = null,
    store: ReturnType<typeof makeStore> | null = null,
    session: string | null = null,
    hiddenSession: string | null = null
  let disposed = false,
    revision = -1,
    generation = 0
  let poll: ReturnType<typeof setInterval> | null = null
  const remove = () => {
    if (poll) clearInterval(poll)
    poll = null
    if (host) removeReactShadowHost(host)
    host = null
    store = null
    session = null
  }
  const followFullscreen = () => {
    if (!host) return
    const fullscreen = document.fullscreenElement
    const replaced =
      fullscreen &&
      ["IFRAME", "VIDEO", "AUDIO", "EMBED", "OBJECT", "CANVAS", "IMG"].includes(fullscreen.tagName)
    // Replaced fullscreen elements cannot render appended HTML children.
    // A passive top-layer view remains readable without intercepting playback
    // input or accessing the iframe's child document. Escape restores controls.
    if (replaced && typeof host.showPopover === "function") {
      if (host.parentElement !== document.body) document.body.append(host)
      host.popover = "manual"
      Object.assign(host.style, {
        margin: "0",
        padding: "0",
        border: "0",
        background: "transparent",
        overflow: "visible",
      })
      if (!host.matches(":popover-open")) {
        try {
          host.showPopover()
        } catch {
          /* Fullscreen may have ended meanwhile. */
        }
      }
    } else {
      if (host.hasAttribute("popover")) {
        if (host.matches(":popover-open")) host.hidePopover()
        host.removeAttribute("popover")
      }
      const parent = !replaced && fullscreen ? fullscreen : document.body
      if (host.parentElement !== parent) parent.append(host)
    }
  }
  const apply = (raw: SourceSnapshot, resetRevision = false) => {
    const parsed = sourceSnapshotSchema.safeParse(raw)
    if (disposed || !parsed.success || (!resetRevision && parsed.data.revision < revision)) return
    revision = parsed.data.revision
    const view = parsed.data.view
    if (!view) {
      remove()
      return
    }
    if (view.session === hiddenSession) return
    if (session === view.session && store) {
      store.set(view)
      syncPoll(view)
      return
    }
    remove()
    const stale = document.getElementById(HOST_ID)
    if (stale) removeReactShadowHost(stale)
    session = view.session
    store = makeStore(view)
    host = createReactShadowHost(
      <Pane
        store={store}
        onClose={() => {
          hiddenSession = session
          remove()
        }}
      />,
      {
        position: "block",
        inheritStyles: false,
        cssContent: [style],
        forcedTheme: "dark",
        style: { height: "100%" },
      },
    )
    host.id = HOST_ID
    Object.assign(host.style, { position: "fixed", zIndex: "2147483001", pointerEvents: "none" })
    followFullscreen()
    syncPoll(view)
  }
  const pull = () => {
    const start = ++generation
    void sendMessage("getTabAudioView", undefined)
      .then((value) => {
        if (start === generation) apply(value, true)
      })
      .catch(() => {})
  }
  const syncPoll = (view: SourceView) => {
    if (view.status === "stopped") {
      if (poll) clearInterval(poll)
      poll = null
    } else if (!poll) poll = setInterval(pull, 15000)
  }
  const unsubscribe = onMessage("tabAudioViewChanged", (message) => {
    if (
      message.sender.id !== browser.runtime.id ||
      message.sender.url !== browser.runtime.getURL("/background.js")
    )
      return
    generation++
    apply(message.data)
  })
  const visible = () => {
    if (document.visibilityState === "visible") pull()
  }
  window.addEventListener("focus", pull)
  document.addEventListener("visibilitychange", visible)
  document.addEventListener("fullscreenchange", followFullscreen)
  pull()
  return () => {
    disposed = true
    unsubscribe()
    remove()
    window.removeEventListener("focus", pull)
    document.removeEventListener("visibilitychange", visible)
    document.removeEventListener("fullscreenchange", followFullscreen)
  }
}
