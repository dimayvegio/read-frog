import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

type PiPAPI = { requestWindow: (options: { width: number; height: number }) => Promise<Window> }
const api = () =>
  (window as Window & { documentPictureInPicture?: PiPAPI }).documentPictureInPicture
const css = `html{color-scheme:dark}body{margin:0;background:#111711;color:#edf3e8;font:17px/1.65 system-ui,sans-serif}main{height:100dvh;display:flex;flex-direction:column}header,footer{padding:10px 14px;border-bottom:1px solid #3d4a35;font-size:12px}header{display:flex;align-items:center;gap:8px}header strong{flex:1}button{font:inherit;color:inherit;background:#2f3e25;border:1px solid #5c704a;border-radius:6px;padding:5px 9px;cursor:pointer}.text{flex:1;min-height:0;overflow:auto;padding:12px 18px;white-space:pre-wrap;overflow-wrap:anywhere}.pending{color:#c5e3a2;border-left:2px solid #819c65;padding-left:10px}small{display:block;color:#aebda3;font-size:11px}p{margin:0 0 14px}footer{border-top:1px solid #3d4a35;border-bottom:0}.follow{margin:5px 12px}button:disabled{opacity:.45}`

function Transcript({
  text,
  pending,
  status,
  canStop,
  stop,
}: {
  text: string
  pending: string
  status: string
  canStop: boolean
  stop: () => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [follow, setFollow] = useState(true)
  useLayoutEffect(() => {
    if (follow && scroller.current && (text || pending))
      scroller.current.scrollTop = scroller.current.scrollHeight
  }, [text, pending, follow])
  return (
    <main data-pinned-transcript>
      <header>
        <strong>Read Frog · Chép lời đã ghim</strong>
        <button type="button" disabled={!canStop} onClick={stop}>
          Dừng thu
        </button>
      </header>
      <small style={{ padding: "6px 14px" }}>
        {status || "Sẵn sàng · Không tự ẩn khi im lặng"}
      </small>
      <div
        className="text"
        ref={scroller}
        onScroll={() => {
          const node = scroller.current
          if (node) setFollow(node.scrollHeight - node.scrollTop - node.clientHeight < 36)
        }}
      >
        {text ? (
          <p data-pinned-final>{text.slice(-16000)}</p>
        ) : (
          !pending && (
            <p>Lời nói hoặc văn bản file sẽ hiện ở đây. Cửa sổ vẫn mở khi chưa có tiếng.</p>
          )
        )}
        {pending && (
          <p className="pending" data-pinned-pending>
            {pending.slice(-4000)}
            <small>Đang nhận dạng · chưa chốt</small>
          </p>
        )}
      </div>
      {!follow && (
        <button type="button" className="follow" onClick={() => setFollow(true)}>
          ↓ Theo dõi chữ mới
        </button>
      )}
      <footer>
        Giữ tab Audio mở. Đóng cửa sổ ghim không dừng thu. Bản đầy đủ/TXT/SRT ở tab Audio.
      </footer>
    </main>
  )
}

/** Owner-page portal: no new source authorization, capture, microphone or paid job. */
export function PinnedTranscript({
  text,
  pending,
  status,
  canStop,
  stop,
}: {
  text: string
  pending: string
  status: string
  canStop: boolean
  stop: () => void
}) {
  const [pip, setPip] = useState<Window | null>(null),
    [error, setError] = useState("")
  const current = useRef<Window | null>(null),
    mounted = useRef(true),
    opening = useRef(false)
  useEffect(() => {
    mounted.current = true
    const cleanup = () => {
      mounted.current = false
      current.current?.close()
      current.current = null
    }
    window.addEventListener("pagehide", cleanup)
    return () => {
      cleanup()
      window.removeEventListener("pagehide", cleanup)
    }
  }, [])
  const open = async () => {
    if (current.current && !current.current.closed) {
      current.current.focus()
      return
    }
    if (opening.current) return
    const capability = api()
    if (!capability) {
      setError("Trình duyệt chưa hỗ trợ cửa sổ ghim trên cùng. Dùng Ghim khung tại trang nguồn.")
      return
    }
    opening.current = true
    setError("")
    try {
      const child = await capability.requestWindow({ width: 460, height: 580 })
      if (!mounted.current) {
        child.close()
        return
      }
      current.current = child
      child.document.title = "Read Frog · Chép lời đã ghim"
      const style = child.document.createElement("style")
      style.textContent = css
      child.document.head.append(style)
      const closed = () => {
        if (current.current !== child) return
        current.current = null
        if (mounted.current) setPip(null)
      }
      child.addEventListener("pagehide", closed, { once: true })
      setPip(child)
    } catch {
      if (mounted.current)
        setError(
          "Chưa mở được cửa sổ ghim. Bấm nút trực tiếp trong tab Audio trên Edge/Chrome hỗ trợ Picture-in-Picture.",
        )
    } finally {
      opening.current = false
    }
  }
  return (
    <>
      <div className="row">
        <button type="button" data-pin-audio onClick={() => void open()}>
          {pip ? "Mở cửa sổ đã ghim ↗" : "Ghim cửa sổ trên cùng"}
        </button>
        {pip && (
          <button type="button" onClick={() => pip.close()}>
            Đóng cửa sổ ghim
          </button>
        )}
        <small>Hiện cả khi chuyển tab; không tự tắt lúc im lặng.</small>
      </div>
      {error && <p role="status">{error}</p>}
      {pip &&
        !pip.closed &&
        createPortal(
          <Transcript
            text={text}
            pending={pending}
            status={status}
            canStop={canStop}
            stop={stop}
          />,
          pip.document.body,
        )}
    </>
  )
}
