import type { TabNotice } from "@/utils/audio-transcription/tab-schema"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { browser } from "#imports"
import { transcribeAudioFile } from "@/utils/audio-transcription/client"
import {
  audioFormat,
  MAX_AUDIO_FILE,
  languageCode,
  type TranscriptionResult,
} from "@/utils/audio-transcription/schema"
import { sendMessage } from "@/utils/message"
import "./style.css"

type Item = {
  id: string
  file: File
  status: "ready" | "preparing" | "processing" | "done" | "error" | "cancelled"
  text: string
  message: string
  result?: TranscriptionResult
}
const common = [
  ["en", "Tiếng Anh"],
  ["zh", "Tiếng Trung"],
  ["ja", "Tiếng Nhật"],
  ["vi", "Tiếng Việt"],
] as const
const presets = [
  ["Anh + Nhật", ["en", "ja"]],
  ["Anh + Nhật + Việt", ["en", "ja", "vi"]],
  ["Anh + Trung", ["en", "zh"]],
] as const
const cleanName = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/[<>:"/\\|?*]/g, "_")
    .slice(0, 100) || "audio"
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
const textBlob = (text: string) => new Blob(["\ufeff", text], { type: "text/plain;charset=utf-8" })
function Preview({ file }: { file: File }) {
  const audio = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    if (audio.current) audio.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  return <audio ref={audio} controls preload="metadata" aria-label="Nghe thử file trên máy" />
}
function App() {
  const [items, setItems] = useState<Item[]>([]),
    itemsRef = useRef(items)
  useLayoutEffect(() => {
    itemsRef.current = items
  }, [items])
  const [selected, setSelected] = useState<string | null>(null)
  const [hints, setHints] = useState<string[]>(["en", "zh", "ja", "vi"]),
    [extra, setExtra] = useState(""),
    [auto, setAuto] = useState(false),
    [prompt, setPrompt] = useState("")
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState<"live" | "record">("live")
  const [captureState, setCaptureState] = useState("idle"),
    [captureMessage, setCaptureMessage] = useState("")
  const [liveText, setLiveText] = useState(""),
    [pending, setPending] = useState("")
  const [youtubeSession, setYouTubeSession] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null),
    capture = useRef<string | null>(null),
    starting = useRef(false),
    mounted = useRef(true)
  const channel = useRef(new URLSearchParams(location.search).get("source")),
    [sourceReady, setSourceReady] = useState(() =>
      Boolean(new URLSearchParams(location.search).get("source")),
    )
  const active = items.find((item) => item.id === selected)
  const locked = busy || captureState !== "idle"
  const options = () => {
    const languages = auto
      ? []
      : [
          ...new Set([
            ...hints,
            ...extra
              .split(/[,\s]+/)
              .filter(Boolean)
              .map((code) => languageCode.parse(code)),
          ]),
        ]
    if (languages.length > 16) throw new Error("Chọn tối đa 16 mã ngôn ngữ.")
    return { languages, prompt: prompt.trim() }
  }
  const addFiles = useCallback((files: File[]) => {
    const next = [...itemsRef.current]
    let issue = ""
    for (const file of files) {
      if (!audioFormat(file.name) || file.size < 16 || file.size > MAX_AUDIO_FILE) {
        issue = "Chỉ nhận file âm thanh đúng định dạng, tối đa 25 MB mỗi file."
        continue
      }
      if (
        next.length >= 8 ||
        next.reduce((sum, item) => sum + item.file.size, 0) + file.size > 100_000_000
      ) {
        issue = "Mỗi lượt giữ tối đa 8 file, tổng 100 MB. Tải kết quả và xóa file cũ để thêm."
        break
      }
      const item: Item = {
        id: crypto.randomUUID(),
        file,
        status: "ready",
        text: "",
        message: "Chưa gửi OpenAI",
      }
      next.push(item)
      setSelected(item.id)
    }
    itemsRef.current = next
    setItems(next)
    setError(issue)
  }, [])
  const update = (id: string, patch: Partial<Item>) =>
    setItems((all) => all.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  const run = async (ids: string[]) => {
    if (controller.current || captureState !== "idle") return
    let config: ReturnType<typeof options>
    try {
      config = options()
    } catch {
      setError("Mã ngôn ngữ chưa hợp lệ. Ví dụ: en, zh, ja, vi, fr, ko.")
      return
    }
    const abort = (controller.current = new AbortController())
    setBusy(true)
    setError("")
    try {
      for (const id of ids) {
        if (abort.signal.aborted) break
        const item = itemsRef.current.find((value) => value.id === id)
        if (!item) continue
        setSelected(id)
        update(id, {
          status: "preparing",
          text: "",
          result: undefined,
          message: "Đang chuẩn bị file…",
        })
        try {
          const result = await transcribeAudioFile(item.file, config, abort.signal, (value) => {
            if (!mounted.current || abort.signal.aborted) return
            if (value.loaded !== undefined)
              update(id, {
                message: `Đang chuẩn bị file ${Math.round((value.loaded / item.file.size) * 100)}%`,
              })
            if (value.processing)
              update(id, { status: "processing", message: "Đang gửi OpenAI và nhận bản chép lời…" })
            if (value.text !== undefined) update(id, { text: value.text })
          })
          if (!mounted.current || abort.signal.aborted) break
          update(id, {
            status: "done",
            text: result.text,
            result,
            message: result.text.trim()
              ? "Đã chép lời hoàn chỉnh"
              : "Đã xử lý, không có lời nói được nhận dạng",
          })
        } catch (issue) {
          if (!mounted.current) break
          update(id, {
            status: abort.signal.aborted ? "cancelled" : "error",
            message: abort.signal.aborted
              ? "Đã dừng. Chữ đang có chỉ là bản nháp."
              : issue instanceof Error
                ? issue.message
                : "Chưa chép lời được. Hãy thử lại.",
          })
          break // No automatic paid retries, including on the next queued file.
        }
      }
    } finally {
      if (controller.current === abort) controller.current = null
      if (mounted.current) setBusy(false)
    }
  }
  useEffect(() => {
    mounted.current = true
    const receive = (raw: unknown, sender: { id?: string; url?: string }) => {
      if (
        !raw ||
        typeof raw !== "object" ||
        sender.id !== browser.runtime.id ||
        sender.url !== browser.runtime.getURL("/offscreen.html")
      )
        return
      const value = raw as TabNotice & { target?: string }
      if (
        value.target !== "read-frog-tab-audio-notice" ||
        (value.session !== capture.current && !starting.current)
      )
        return
      if (starting.current && !capture.current) capture.current = value.session
      if (value.type === "started") setCaptureState("recording")
      if (value.type === "text") {
        setLiveText(value.text)
        setPending(value.pending)
      }
      if (value.type === "stopped") {
        setCaptureState("idle")
        setCaptureMessage(value.message)
        starting.current = false
        capture.current = null
      }
      if (
        value.type === "recording" &&
        value.url.startsWith(`blob:${browser.runtime.getURL("/")}`) &&
        value.size >= 16 &&
        value.size <= MAX_AUDIO_FILE
      ) {
        void fetch(value.url)
          .then((r) => {
            if (!r.ok) throw new Error()
            return r.blob()
          })
          .then((blob) => {
            if (mounted.current && blob.size === value.size)
              addFiles([
                new File([blob], `Tab-${new Date().toISOString().replaceAll(":", "-")}.webm`, {
                  type: "audio/webm",
                }),
              ])
          })
          .catch(() => {
            if (mounted.current)
              setError("Chưa nhận được bản thu. Giữ trang Audio mở trong lúc thu và khi dừng.")
          })
          .finally(() => URL.revokeObjectURL(value.url))
      }
    }
    browser.runtime.onMessage.addListener(receive)
    const dispose = () => {
      mounted.current = false
      controller.current?.abort()
      if (capture.current)
        void sendMessage("tabAudioControl", { command: "cancel", session: capture.current }).catch(
          () => {},
        )
    }
    window.addEventListener("pagehide", dispose)
    return () => {
      dispose()
      browser.runtime.onMessage.removeListener(receive)
      window.removeEventListener("pagehide", dispose)
    }
  }, [addFiles])
  const startCapture = async () => {
    if (locked || starting.current || controller.current || !channel.current) return
    try {
      const config = options()
      starting.current = true
      setCaptureState("connecting")
      setCaptureMessage("")
      setLiveText("")
      setPending("")
      const result = await sendMessage("tabAudioControl", {
        command: "start",
        channel: channel.current,
        mode,
        ...config,
      })
      if (starting.current && result.session) capture.current = result.session
      if (result.session && result.youtube) setYouTubeSession(result.session)
    } catch (issue) {
      setCaptureState("idle")
      setError(issue instanceof Error ? issue.message : "Chưa mở được luồng âm thanh.")
      starting.current = false
    } finally {
      channel.current = null
      setSourceReady(false)
    }
  }
  const stopCapture = async () => {
    if (!capture.current) return
    setCaptureState("stopping")
    await sendMessage("tabAudioControl", { command: "stop", session: capture.current }).catch(
      () => {
        setCaptureState("idle")
        setError("Kết nối thu âm đã đóng. Phần chưa chốt là bản nháp.")
      },
    )
  }
  const exportAll = async () => {
    const { default: JSZip } = await import("jszip")
    const zip = new JSZip()
    items
      .filter((item) => item.text)
      .forEach((item, i) =>
        zip.file(
          `${i + 1}-${cleanName(item.file.name)}${item.status === "done" ? "" : ".partial"}.txt`,
          "\ufeff" + item.text,
        ),
      )
    if (liveText || pending)
      zip.file("Tab-transcript.txt", liveText + (pending ? "\n\n[CHƯA CHỐT]\n" + pending : ""))
    download(
      await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 9 },
      }),
      "ReadFrog-Transcripts.zip",
    )
  }
  return (
    <main>
      <header>
        <div>
          <span className="brand">READ FROG / AUDIO</span>
          <h1>Âm thanh thành văn bản.</h1>
          <p>
            Tải file hoặc nghe âm thanh từ tab đang phát. Giữ trang này mở và tiếp tục làm việc trên
            máy.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void sendMessage("openOptionsPage", { route: "/api-providers" })}
        >
          OpenAI Settings ↗
        </button>
      </header>
      <section className="settings" aria-label="Cấu hình chép lời">
        <div>
          <strong>Gợi ý ngôn ngữ</strong>
          <div className="row languages">
            {common.map(([code, label]) => (
              <label key={code}>
                <input
                  type="checkbox"
                  checked={hints.includes(code)}
                  disabled={locked || auto}
                  onChange={(e) =>
                    setHints((old) =>
                      e.target.checked ? [...old, code] : old.filter((v) => v !== code),
                    )
                  }
                />
                {label}
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                checked={auto}
                disabled={locked}
                onChange={(e) => setAuto(e.target.checked)}
              />
              Tự nhận dạng
            </label>
          </div>
          <div className="row presets" aria-label="Chọn nhanh ngôn ngữ cuộc họp">
            {presets.map(([label, codes]) => (
              <button
                type="button"
                key={label}
                disabled={locked}
                onClick={() => {
                  setAuto(false)
                  setExtra("")
                  setHints([...codes])
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <small>
            Chọn những ngôn ngữ dự kiến nghe; có thể trộn ngôn ngữ trong cùng câu. Đây là gợi ý,
            không phải dịch sang ngôn ngữ đó.
          </small>
          <input
            aria-label="Mã ngôn ngữ khác"
            placeholder="Ngôn ngữ khác: fr, de, ko… (mã ISO)"
            value={extra}
            disabled={locked || auto}
            onChange={(e) => setExtra(e.target.value)}
          />
        </div>
        <label>
          Ngữ cảnh / thuật ngữ (tùy chọn)
          <textarea
            value={prompt}
            maxLength={1000}
            disabled={locked}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            placeholder="Tên riêng, chủ đề, thuật ngữ giúp nhận dạng chính xác hơn…"
          />
        </label>
      </section>
      <section className="capture">
        <div className="row">
          <h2>Nghe từ tab video / MP3</h2>
          <span className="badge">Edge / Chrome 116+</span>
        </div>
        <p>
          Tại tab đang phát, mở popup Read Frog → <b>Audio → Văn bản</b> để chọn nguồn. Thu tối đa
          30 phút. Chuyển tab được; đóng hoặc tải lại trang Audio sẽ dừng thu.
        </p>
        {youtubeSession && (
          <div className="row">
            <button
              type="button"
              onClick={() =>
                void sendMessage("tabAudioViewAction", {
                  session: youtubeSession,
                  action: "video",
                }).catch(() => setError("Chưa mở lại được tab video."))
              }
            >
              Về video YouTube ↗
            </button>
            <small>
              Khung chép lời hiện ngay trên YouTube, có thể kéo/đổi kích thước và thu gọn. Giữ trang
              Audio này mở trong lúc nghe.
            </small>
          </div>
        )}
        <div className="row modes">
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === "live"}
              disabled={locked}
              onChange={() => setMode("live")}
            />
            <span>
              <b>Chép lời trực tiếp</b>
              <small>
                gpt-live-transcribe · khoảng $0,017/phút · âm thanh gửi liên tục khi bắt đầu
              </small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === "record"}
              disabled={locked}
              onChange={() => setMode("record")}
            />
            <span>
              <b>Thu trước, chuyển sau</b>
              <small>
                Thu trên máy; chỉ gửi OpenAI khi bấm chuyển bản thu · khoảng $0,0045/phút
              </small>
            </span>
          </label>
        </div>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={locked || !sourceReady}
            onClick={() => void startCapture()}
          >
            {mode === "live" ? "Bắt đầu chép lời trực tiếp" : "Bắt đầu thu tab"}
          </button>
          <button
            type="button"
            disabled={captureState !== "recording"}
            onClick={() => void stopCapture()}
          >
            Dừng thu
          </button>
          <span role="status">
            {captureState === "connecting"
              ? "Đang kết nối âm thanh và OpenAI…"
              : captureState === "recording"
                ? mode === "live"
                  ? "● Đang nghe và chép lời"
                  : "● Đang thu trên máy"
                : captureState === "stopping"
                  ? "Đang dừng và chốt câu cuối…"
                  : captureMessage ||
                    (sourceReady
                      ? "Đã chọn tab nguồn, chưa bắt đầu thu."
                      : "Mở từ popup tại tab cần thu để chọn nguồn.")}
          </span>
        </div>
        {(liveText || pending) && (
          <div className="live">
            <h3>Bản chép lời trực tiếp</h3>
            <p className="transcript">{liveText}</p>
            {pending && (
              <p className="pending">
                {pending}
                <small>Đang nhận dạng / chưa chốt</small>
              </p>
            )}
            <button
              type="button"
              onClick={() =>
                download(
                  textBlob(liveText + (pending ? "\n\n[CHƯA CHỐT]\n" + pending : "")),
                  "Tab-transcript.txt",
                )
              }
            >
              Tải TXT
            </button>
          </div>
        )}
      </section>
      <section className="workspace">
        <aside
          onDragOver={(e) => {
            e.preventDefault()
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (!locked) addFiles([...e.dataTransfer.files])
          }}
        >
          <h2>File âm thanh</h2>
          <p>MP3, M4A, MP4, WAV, WebM, OGG, FLAC, MPEG, MPGA · ≤25 MB/file.</p>
          <label className="picker">
            ＋ Chọn hoặc thả file
            <input
              type="file"
              aria-label="Chọn file âm thanh"
              multiple
              disabled={locked}
              accept=".mp3,.mpga,.mpeg,.mp4,.m4a,.wav,.webm,.ogg,.flac"
              onChange={(e) => {
                addFiles([...(e.target.files ?? [])])
                e.target.value = ""
              }}
            />
          </label>
          <div className="file-list">
            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                className={selected === item.id ? "selected" : ""}
                onClick={() => setSelected(item.id)}
              >
                <b>{item.file.name}</b>
                <small>
                  {(item.file.size / 1_000_000).toFixed(2)} MB ·{" "}
                  {item.status === "done"
                    ? "Hoàn tất"
                    : item.status === "ready"
                      ? "Chưa xử lý"
                      : item.status === "error"
                        ? "Lỗi"
                        : item.status === "cancelled"
                          ? "Đã dừng"
                          : "Đang xử lý"}
                </small>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="primary"
            disabled={locked || !items.some((item) => item.status === "ready")}
            onClick={() =>
              void run(items.filter((item) => item.status === "ready").map((item) => item.id))
            }
          >
            Chuyển các file chưa xử lý
          </button>
          <button type="button" disabled={!busy} onClick={() => controller.current?.abort()}>
            Dừng xử lý file
          </button>
        </aside>
        <article>
          {active ? (
            <>
              <div className="row">
                <h2>{active.file.name}</h2>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    setItems((old) => old.filter((item) => item.id !== active.id))
                    setSelected(null)
                  }}
                >
                  Xóa file
                </button>
              </div>
              <Preview file={active.file} />
              {active.file.name.startsWith("Tab-") && (
                <button type="button" onClick={() => download(active.file, active.file.name)}>
                  Tải bản thu WebM
                </button>
              )}
              <div className="row">
                <button
                  type="button"
                  className="primary"
                  disabled={locked}
                  onClick={() => void run([active.id])}
                >
                  {active.status === "ready"
                    ? "Chuyển file này thành chữ"
                    : "Chép lời lại (có tính phí)"}
                </button>
                <span role="status">{active.message}</span>
              </div>
              <textarea
                className="result"
                aria-label="Bản chép lời"
                placeholder="Văn bản sẽ xuất hiện ở đây…"
                value={active.text}
                readOnly={locked}
                onChange={(e) => update(active.id, { text: e.target.value })}
              />
              {active.result && (
                <p className="muted">
                  {active.result.model} ·{" "}
                  {active.result.languages.length
                    ? `Ngôn ngữ nhận dạng: ${active.result.languages.join(", ")}`
                    : "API không trả dự đoán ngôn ngữ"}{" "}
                  ·{" "}
                  {active.result.seconds === null
                    ? "API chưa trả thời lượng tính phí"
                    : `${active.result.seconds} giây theo API`}
                </p>
              )}
              <div className="row">
                <button
                  type="button"
                  disabled={!active.text}
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(active.text)
                      .catch(() => setError("Chưa copy được. Hãy chọn văn bản và nhấn Ctrl+C."))
                  }
                >
                  Copy
                </button>
                <button
                  type="button"
                  disabled={!active.text}
                  onClick={() =>
                    download(
                      textBlob(active.text),
                      `${cleanName(active.file.name)}${active.status === "done" ? "" : ".partial"}.txt`,
                    )
                  }
                >
                  Tải TXT{active.status !== "done" ? " (bản nháp)" : ""}
                </button>
              </div>
            </>
          ) : (
            <div className="empty">
              <span>音 → Aa</span>
              <h2>Thêm file để bắt đầu.</h2>
              <p>
                Nghe thử trên máy, chọn ngôn ngữ rồi bấm chuyển thành chữ.
                <br />
                File và văn bản chỉ giữ trong lượt này. Tải TXT trước khi đóng trang.
              </p>
            </div>
          )}
        </article>
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <footer>
        <p>
          File/bản thu: gpt-transcribe · khoảng $0,0045/phút. Giá tham khảo 09/11/2026; chi phí thực
          tế theo OpenAI. Kết quả là nguyên ngữ, chưa dịch. Không tự xử lý file hoặc tự gửi lại khi
          lỗi.
        </p>
        <button
          type="button"
          disabled={!items.some((item) => item.text) && !liveText && !pending}
          onClick={() =>
            void exportAll().catch(() => setError("Chưa tạo được ZIP. Bạn có thể tải từng TXT."))
          }
        >
          Tải tất cả TXT trong ZIP
        </button>
      </footer>
    </main>
  )
}
createRoot(document.getElementById("root")!).render(<App />)
