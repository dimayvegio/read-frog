import type { SmartProfile } from "@/utils/subtitles/dubbing/smart"
import { useAtomValue } from "jotai"
import { useEffect, useRef, useState } from "react"
import { configAtom } from "@/utils/atoms/config"
import { createPortStreamPromise } from "@/utils/content-script/port-streaming"
import { getSourceDocumentTitle } from "@/utils/content/document-title"
import { sendMessage } from "@/utils/message"
import {
  SMART_VIDEO_PORT,
  SMART_AUDIO_SECONDS,
  parseSmartProfile,
  smartTrackHash,
} from "@/utils/subtitles/dubbing/smart"
import { adPlayingAtom, currentVideoIdAtom, subtitlesStore } from "../atoms"
import { SmartVideoContext } from "./smart-video-context"
import { useSubtitlesUI } from "./subtitles-ui-context"
export function SmartVideoProvider({ children }: { children: React.ReactNode }) {
  const ui = useSubtitlesUI(),
    id = useAtomValue(currentVideoIdAtom),
    config = useAtomValue(configAtom)
  const [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [profile, setProfile] = useState<SmartProfile | null>(null),
    [status, setStatus] = useState("AI mặc định tắt. Chuẩn bị audio trước để phân biệt người nói.")
  const run = useRef<AbortController | null>(null),
    file = useRef<File | null>(null),
    enabledRef = useRef(false),
    keyRevision = useRef<number | null>(null)
  const scopeRef = useRef({ id, config })
  const cancel = () => {
    run.current?.abort()
    run.current = null
    setBusy(false)
  }
  useEffect(() => {
    if (scopeRef.current.id !== id || scopeRef.current.config !== config) {
      scopeRef.current = { id, config }
      run.current?.abort()
      run.current = null
      file.current = null
      enabledRef.current = false
      setEnabled(false)
      setProfile(null)
      setBusy(false)
      setStatus("Nguồn hoặc cấu hình đã đổi. Phân tích cũ đã xóa.")
      ui.setSmartProfile?.(null, false)
    }
  }, [id, config, ui])
  useEffect(() => {
    const close = () => {
      run.current?.abort()
      run.current = null
    }
    window.addEventListener("pagehide", close)
    return () => {
      window.removeEventListener("pagehide", close)
      close()
    }
  }, [])
  useEffect(() => {
    if (!profile) return undefined
    let closed = false,
      checking = false
    const timer = setInterval(() => {
      if (checking) return
      checking = true
      void sendMessage("getOpenAIKeyStatus")
        .then((key) => {
          if (closed) return
          if (
            !key.configured ||
            key.revision !== keyRevision.current ||
            ui.getSmartProfile?.() !== profile
          ) {
            run.current?.abort()
            run.current = null
            file.current = null
            setProfile(null)
            setBusy(false)
            ui.setSmartProfile?.(null, false)
            setStatus("CC hoặc khóa OpenAI đã đổi. Phân tích cũ đã xóa; bấm chuẩn bị lại.")
          }
        })
        .catch(() => {})
        .finally(() => {
          checking = false
        })
    }, 2000)
    return () => {
      closed = true
      clearInterval(timer)
    }
  }, [profile, ui])
  const prepare = async () => {
    if (run.current) return false
    if (!enabledRef.current) return true
    if (!file.current && profile && ui.getSmartProfile?.() === profile) return true
    const video = ui.getDubbingVideoElement?.()
    if (!video || subtitlesStore.get(adPlayingAtom)) {
      setStatus("Hãy đợi video chính sẵn sàng.")
      return false
    }
    const owner = new AbortController(),
      route = location.href,
      src = video.currentSrc,
      videoId = subtitlesStore.get(currentVideoIdAtom),
      configSnapshot = subtitlesStore.get(configAtom)
    const canRestore = () =>
      location.href === route &&
      video.isConnected &&
      video.currentSrc === src &&
      ui.getDubbingVideoElement?.() === video &&
      subtitlesStore.get(currentVideoIdAtom) === videoId &&
      !subtitlesStore.get(adPlayingAtom)
    const valid = () =>
      run.current === owner &&
      !owner.signal.aborted &&
      enabledRef.current &&
      canRestore() &&
      subtitlesStore.get(configAtom) === configSnapshot
    run.current = owner
    setBusy(true)
    setStatus("Đang lấy CC để chuẩn bị phân tích…")
    try {
      if (
        video.duration > SMART_AUDIO_SECONDS ||
        (!file.current && (!Number.isFinite(video.duration) || video.duration <= 0))
      )
        throw new Error("Chuẩn bị hỗ trợ video tối đa 10 phút. Hãy chọn video/audio phù hợp.")
      const key = await sendMessage("getOpenAIKeyStatus")
      owner.signal.throwIfAborted()
      if (!key.configured) throw new Error("Chưa có khóa OpenAI.")
      const cues = await ui.getSentenceStudySource(owner.signal)
      if (!cues.length)
        throw new Error("Cần CC gốc để gán người nói đúng câu. Không tự tạo CC khi thiếu.")
      if (cues.length > 1500 || cues.reduce((n, c) => n + c.text.length, 0) > 100000)
        throw new Error("CC vượt giới hạn phân tích của phiên này (1.500 câu / 100.000 ký tự).")
      const { prepareAudioFile, recordVideoAudio } =
        await import("@/utils/subtitles/dubbing/prepare-audio")
      if (!valid()) throw new DOMException("Đã đổi nguồn", "AbortError")
      const audio = file.current
        ? await prepareAudioFile(file.current, owner.signal)
        : await recordVideoAudio(
            video,
            owner.signal,
            valid,
            (text) => {
              if (valid()) setStatus(text)
            },
            canRestore,
          )
      if (!valid()) throw new DOMException("Đã đổi nguồn", "AbortError")
      const currentKey = await sendMessage("getOpenAIKeyStatus")
      if (!valid()) throw new DOMException("Đã đổi nguồn", "AbortError")
      if (!currentKey.configured || currentKey.revision !== key.revision)
        throw new Error("Khóa OpenAI đã đổi. Chưa gửi audio.")
      setStatus(
        "Đang gửi audio trực tiếp tới OpenAI để tóm tắt, phân biệt người nói và chọn cách đọc…",
      )
      const result = await createPortStreamPromise<SmartProfile>(
        SMART_VIDEO_PORT,
        {
          ...audio,
          sourceUrl: route,
          cues: cues.map(({ text, start, end }) => ({ text, start, end })),
          title: getSourceDocumentTitle().slice(0, 300),
          target: config.language.targetCode,
        },
        { signal: owner.signal, keepAliveIntervalMs: 10000 },
      )
      if (!valid()) throw new DOMException("Đã đổi nguồn", "AbortError")
      const keyStatus = await sendMessage("getOpenAIKeyStatus")
      owner.signal.throwIfAborted()
      if (!keyStatus.configured || keyStatus.revision !== key.revision)
        throw new Error("Khóa OpenAI đã đổi. Chưa áp dụng kết quả cũ.")
      if (!valid()) throw new DOMException("Đã đổi nguồn", "AbortError")
      if (result.trackHash !== smartTrackHash(cues)) throw new Error("Phân tích không khớp CC.")
      const { trackHash: _hash, ...wire } = result,
        next = parseSmartProfile(wire, cues)
      ui.setSmartProfile?.(next)
      keyRevision.current = key.revision
      setProfile(next)
      file.current = null
      setStatus(
        `Đã chuẩn bị ${next.speakers.length} giọng. Bấm Bắt đầu lồng tiếng hoặc bật phụ đề. Câu chưa rõ người nói dùng giọng mặc định.`,
      )
      return true
    } catch (error) {
      if (run.current === owner)
        setStatus(error instanceof Error ? error.message : "Phân tích thất bại. Không tự thử lại.")
      return false
    } finally {
      if (run.current === owner) {
        run.current = null
        setBusy(false)
      }
    }
  }
  return (
    <SmartVideoContext
      value={{
        enabled,
        busy,
        profile,
        status,
        prepare,
        cancel: () => {
          cancel()
          setStatus("Đã hủy chuẩn bị.")
        },
        chooseFile: (value) => {
          if (!busy) file.current = value
        },
        setEnabled: (value) => {
          cancel()
          enabledRef.current = value
          setEnabled(value)
          if (!value) {
            ui.setSmartProfile?.(null)
            setProfile(null)
            file.current = null
            setStatus("AI đã tắt; dùng CC và giọng đang cấu hình.")
          }
        },
      }}
    >
      {children}
    </SmartVideoContext>
  )
}
