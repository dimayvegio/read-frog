import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import { useEffect, useMemo } from "react"
import { SentenceStudyPlayer } from "@/utils/subtitles/sentence-study"
import {
  adPlayingAtom,
  currentVideoIdAtom,
  sourceTrackAtom,
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
  const { getVideoElement } = useSubtitlesUI()
  const supported = useYouTubeStudySupported(),
    enabled = useAtomValue(sentenceStudyEnabledAtom)
  const track = useAtomValue(sourceTrackAtom),
    videoId = useAtomValue(currentVideoIdAtom)
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
    if (!supported || !enabled || blocked || !visible) {
      setPlayer(null)
      return undefined
    }
    const video = getVideoElement()
    if (!video) return undefined
    const player = new SentenceStudyPlayer(
      video,
      track.filter((cue) => cue.end > cue.start),
      (index) => {
        setLine(index)
        reveal(false)
      },
    )
    player.preferences(repeats, pauseAfter)
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
  }, [
    supported,
    enabled,
    blocked,
    visible,
    getVideoElement,
    track,
    repeats,
    pauseAfter,
    setPlayer,
    setLine,
    reveal,
  ])
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
                disabled={!player}
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
            dùng phím YouTube như cũ. Không gọi thêm OpenAI.
          </p>
        </>
      )}
    </section>
  )
}
