import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo } from "react"
import { SentenceStudyPlayer } from "@/utils/subtitles/sentence-study"
import {
  prepareStudyWords,
  StudySentencePreparation,
  type StudyPreparationState,
} from "@/utils/subtitles/study-segmentation"
import { requestStudySegmentation } from "@/utils/subtitles/study-segmentation-client"
import {
  adPlayingAtom,
  currentVideoIdAtom,
  studySourceTrackAtom,
  subtitlesVisibleAtom,
  videoLoadingAtom,
} from "../atoms"
import { useSubtitlesUI } from "../ui/subtitles-ui-context"
export const sentenceStudyEnabledAtom = atom(false)
export const sentenceHideTranslationAtom = atom(true)
export const sentenceRevealedAtom = atom(false)
const repeatAtom = atom(1),
  autoPauseAtom = atom(true),
  lineAtom = atom(-1)
const playerAtom = atom<SentenceStudyPlayer | null>(null)
const preparationAtom = atom<StudyPreparationState>({ phase: "loading", cues: [] })
const retryAtom = atom(0)
function useYouTubeStudySupported() {
  const { getVideoPageUrl } = useSubtitlesUI()
  const videoId = useAtomValue(currentVideoIdAtom)
  return useMemo(() => {
    try {
      const host = new URL(getVideoPageUrl() ?? location.href).hostname
      return !!videoId && /(^|\.)youtube\.com$/.test(host)
    } catch {
      return false
    }
  }, [getVideoPageUrl, videoId])
}
export function SentenceStudyRuntime() {
  const { getVideoElement, getSentenceStudySource } = useSubtitlesUI()
  const supported = useYouTubeStudySupported(),
    enabled = useAtomValue(sentenceStudyEnabledAtom)
  const videoId = useAtomValue(currentVideoIdAtom)
  const prepared = useAtomValue(preparationAtom),
    setPrepared = useSetAtom(preparationAtom)
  const retry = useAtomValue(retryAtom)
  const rawTrack = useAtomValue(studySourceTrackAtom)
  const currentPlayer = useAtomValue(playerAtom)
  const ad = useAtomValue(adPlayingAtom),
    loading = useAtomValue(videoLoadingAtom)
  const blocked = ad || loading
  const visible = useAtomValue(subtitlesVisibleAtom)
  const repeats = useAtomValue(repeatAtom),
    pauseAfter = useAtomValue(autoPauseAtom)
  const setPlayer = useSetAtom(playerAtom),
    setLine = useSetAtom(lineAtom),
    reveal = useSetAtom(sentenceRevealedAtom)
  const setEnabled = useSetAtom(sentenceStudyEnabledAtom)
  useEffect(() => {
    // Reset the opt-in state at a video boundary, including SPA navigation.
    if (videoId || !supported) {
      setEnabled(false)
      reveal(false)
    }
  }, [videoId, supported, setEnabled, reveal])
  useEffect(() => {
    setPrepared({ phase: "loading", cues: [] })
    if (!supported || !enabled || blocked || !visible || !videoId) return undefined
    const controller = new AbortController()
    let preparation: StudySentencePreparation | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    void (async () => {
      try {
        const source = rawTrack.length ? rawTrack : await getSentenceStudySource(controller.signal)
        controller.signal.throwIfAborted()
        const words = prepareStudyWords(source)
        if (!words.length) throw new Error("Empty CC")
        preparation = new StudySentencePreparation(words, requestStudySegmentation, setPrepared)
        const update = () => {
          const video = getVideoElement()
          if (video) preparation?.update(video.currentTime * 1000)
        }
        update()
        timer = setInterval(update, 500)
      } catch {
        if (!controller.signal.aborted)
          setPrepared({
            phase: "error",
            cues: [],
            message:
              "Không tải được CC để chia câu. Video cần có phụ đề YouTube và OpenAI đã cấu hình.",
          })
      }
    })()
    return () => {
      controller.abort()
      preparation?.stop()
      if (timer) clearInterval(timer)
    }
  }, [
    supported,
    enabled,
    blocked,
    visible,
    videoId,
    // eslint-disable-next-line react/exhaustive-effect-dependencies -- Explicit retry intentionally restarts and cancels this effect.
    retry,
    getSentenceStudySource,
    rawTrack,
    getVideoElement,
    setPrepared,
  ])
  useEffect(() => {
    currentPlayer?.updateCues(prepared.cues)
    currentPlayer?.tick()
  }, [currentPlayer, prepared.cues])
  useEffect(() => {
    currentPlayer?.preferences(repeats, pauseAfter)
  }, [currentPlayer, repeats, pauseAfter])
  useEffect(() => {
    if (!supported || !enabled || blocked || !visible) {
      setPlayer(null)
      return undefined
    }
    const video = getVideoElement()
    if (!video) return undefined
    const player = new SentenceStudyPlayer(video, [], (index) => {
      setLine(index)
      reveal(false)
    })
    setPlayer(player)
    let frame = 0
    const tick = () => {
      player.tick()
      if (!video.paused) frame = requestAnimationFrame(tick)
    }
    tick()
    const key = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        event.repeat ||
        event
          .composedPath()
          .some(
            (node) =>
              node instanceof Element &&
              node.matches(
                'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]),textarea,select,[contenteditable]:not([contenteditable="false"])',
              ),
          )
      )
        return
      const action = ({ j: "previous", k: "replay", l: "next" } as const)[
        event.key.toLowerCase() as "j" | "k" | "l"
      ]
      if (!action) return
      event.preventDefault()
      event.stopImmediatePropagation()
      player.command(action)
    }
    document.addEventListener("keydown", key, true)
    const seeking = () => player.seeking(),
      seeked = () => player.seeked()
    const played = () => {
        cancelAnimationFrame(frame)
        tick()
      },
      paused = () => cancelAnimationFrame(frame),
      updated = () => player.tick()
    video.addEventListener("seeking", seeking)
    video.addEventListener("seeked", seeked)
    video.addEventListener("play", played)
    video.addEventListener("pause", paused)
    video.addEventListener("timeupdate", updated)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener("keydown", key, true)
      video.removeEventListener("seeking", seeking)
      video.removeEventListener("seeked", seeked)
      video.removeEventListener("play", played)
      video.removeEventListener("pause", paused)
      video.removeEventListener("timeupdate", updated)
      setPlayer(null)
    }
  }, [supported, enabled, blocked, visible, getVideoElement, setPlayer, setLine, reveal])
  return null
}
export function SentenceStudyControls() {
  const supported = useYouTubeStudySupported()
  const [enabled, setEnabled] = useAtom(sentenceStudyEnabledAtom)
  const [repeats, setRepeats] = useAtom(repeatAtom),
    [pauseAfter, setPause] = useAtom(autoPauseAtom)
  const [hidden, setHidden] = useAtom(sentenceHideTranslationAtom),
    [revealed, setRevealed] = useAtom(sentenceRevealedAtom)
  const player = useAtomValue(playerAtom),
    line = useAtomValue(lineAtom)
  const prepared = useAtomValue(preparationAtom)
  const retry = useSetAtom(retryAtom)
  if (!supported) return null
  return (
    <section className="m-2 space-y-2 rounded-xl border p-3 text-sm" data-slot="sentence-study">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Luyện nghe từng câu
      </label>
      {enabled && (
        <>
          <p
            role="status"
            className="text-xs text-muted-foreground"
            data-slot="study-preparation"
            data-phase={prepared.phase}
          >
            {prepared.phase === "loading"
              ? "OpenAI đang chia CC thành câu trọn nghĩa… "
              : prepared.phase === "error"
                ? prepared.message
                : (prepared.message ?? "Đã chia câu bằng OpenAI. ")}
            {prepared.cues.length > 0
              ? `Đã chuẩn bị ${prepared.cues.length} câu quanh vị trí xem.`
              : ""}
          </p>
          {prepared.phase === "error" && (
            <button
              type="button"
              className="rounded border px-2 py-1"
              onClick={() => retry((n) => n + 1)}
            >
              Thử chia câu lại
            </button>
          )}
          {prepared.cues[line] && (
            <p data-slot="study-sentence" className="rounded border p-2">
              {prepared.cues[line].text}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["previous", "Câu trước · J"],
                ["replay", "Nghe lại · K"],
                ["next", "Câu sau · L"],
              ] as const
            ).map(([action, label]) => (
              <button
                type="button"
                className="rounded border px-2 py-1 disabled:opacity-40"
                key={action}
                disabled={!player || prepared.cues.length === 0}
                onClick={() => player?.command(action)}
              >
                {label}
              </button>
            ))}
          </div>
          <label>
            Lặp{" "}
            <select
              aria-label="Số lượt lặp câu"
              className="rounded border bg-background"
              value={repeats}
              onChange={(event) => setRepeats(Number(event.target.value))}
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n} lần
                </option>
              ))}
            </select>
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={pauseAfter}
              onChange={(event) => setPause(event.target.checked)}
            />
            Dừng ở cuối câu
          </label>
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(event) => setHidden(event.target.checked)}
            />
            Ẩn bản dịch để tự nghe
          </label>
          {hidden && (
            <button
              type="button"
              className="rounded border px-2 py-1"
              onClick={() => setRevealed(!revealed)}
            >
              {revealed ? "Ẩn bản dịch" : "Hiện bản dịch"}
            </button>
          )}
          <p className="text-xs text-muted-foreground">
            {line >= 0 ? `Câu ${line + 1}. ` : ""}J/K/L điều khiển câu khi chế độ này bật. Tắt để
            dùng phím YouTube như cũ. Chỉ chế độ này gọi thêm OpenAI để chia câu; dùng model phụ đề
            đang chọn và có thể phát sinh phí.
            {prepared.cues.some((cue) => cue.estimated)
              ? " CC thiếu thời gian từng từ: mốc cắt bên trong một dòng được ước lượng."
              : ""}
          </p>
        </>
      )}
    </section>
  )
}
