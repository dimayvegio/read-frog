import type { TTSAudioChunk } from "@/types/openai-tts"
import type { DubbingController, DubbingState } from "@/utils/subtitles/dubbing/controller"
import type { DubbingMode } from "@/utils/subtitles/dubbing/cues"
import type { VoicePlayer } from "@/utils/subtitles/dubbing/player"
import type { DubbingScope } from "@/utils/subtitles/dubbing/scope"
import { useAtomValue } from "jotai"
import { useCallback, useEffect, useRef, useState } from "react"
import { OPENAI_TTS_FILE_PORT } from "@/types/openai-tts"
import { configAtom } from "@/utils/atoms/config"
import { createPortStreamPromise } from "@/utils/content-script/port-streaming"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { sendMessage } from "@/utils/message"
import { buildDubbingCues } from "@/utils/subtitles/dubbing/cues"
import { HtmlVoicePlayer, decodeDubbingAudio } from "@/utils/subtitles/dubbing/player"
import { sameDubbingScope } from "@/utils/subtitles/dubbing/scope"
import { speakerForCue } from "@/utils/subtitles/dubbing/smart"
import { NoSubtitlesError } from "@/utils/subtitles/errors"
import {
  adPlayingAtom,
  currentVideoIdAtom,
  sourceTrackAtom,
  studySourceTrackAtom,
  subtitlesVisibleAtom,
  translatedTrackAtom,
  subtitlesStore,
  videoLoadingAtom,
} from "../atoms"
import { DubbingContext } from "./dubbing-context"
import { useSmartVideo } from "./smart-video-context"
import { useSubtitlesUI } from "./subtitles-ui-context"
interface DubbingSession {
  boundary: DubbingScope & { ad: boolean; loading: boolean }
  abort: AbortController
  controller?: DubbingController
  player?: VoicePlayer
  timer?: ReturnType<typeof setInterval>
}
export function DubbingProvider({ children }: { children: React.ReactNode }) {
  const smart = useSmartVideo()
  const automatic = smart?.mode === "automatic"
  const ui = useSubtitlesUI(),
    config = useAtomValue(configAtom),
    id = useAtomValue(currentVideoIdAtom),
    ad = useAtomValue(adPlayingAtom),
    loading = useAtomValue(videoLoadingAtom)
  const visible = useAtomValue(subtitlesVisibleAtom)
  const [mode, setMode] = useState<DubbingMode>("translated"),
    [duck, setDuck] = useState(0.05),
    [volume, setVolume] = useState(1),
    [offsetMs, setOffset] = useState(0)
  const live = useRef({ duck, volume, offsetMs })
  const [state, setState] = useState<DubbingState>({
    active: false,
    message: "Chọn lời gốc hoặc lời dịch rồi bấm Bắt đầu.",
  })
  const run = useRef<DubbingSession | null>(null)
  const readIdentity = (): DubbingScope => ({
    id: subtitlesStore.get(currentVideoIdAtom),
    config: subtitlesStore.get(configAtom),
    context: ui.getViewerContext?.(),
    profile: automatic ? null : (ui.getSmartProfile?.() ?? null),
  })
  const context = ui.getViewerContext?.(),
    profileIdentity = automatic ? null : (ui.getSmartProfile?.() ?? null)
  const stop = useCallback((message = "Đã tắt lồng tiếng.", resume = false) => {
    const old = run.current
    if (old) {
      old.controller?.stop(message, resume)
      old.abort.abort()
      clearInterval(old.timer)
      if (!old.controller) old.player?.destroy()
    }
    run.current = null
    setState({ active: false, message })
  }, [])
  useEffect(() => {
    const close = () => stop("Video hoặc trang đã đóng.")
    window.addEventListener("pagehide", close)
    return () => {
      window.removeEventListener("pagehide", close)
      const old = run.current
      run.current = null
      old?.abort.abort()
      clearInterval(old?.timer)
      old?.controller?.stop()
      old?.player?.destroy()
    }
  }, [stop])
  useEffect(() => {
    const owner = run.current
    if (
      owner &&
      (!sameDubbingScope(owner.boundary, { id, config, context, profile: profileIdentity }) ||
        owner.boundary.ad !== ad ||
        owner.boundary.loading !== loading)
    )
      stop("Video, ngữ cảnh hoặc cấu hình đã đổi. Bấm Bắt đầu lại.")
  }, [id, config, context, profileIdentity, ad, loading, stop])
  const registerProfileChange = smart?.onProfileChange
  const priorAutomatic = useRef(automatic)
  useEffect(
    () =>
      registerProfileChange?.(() => {
        if (automatic) run.current?.controller?.refreshProfile()
      }),
    [registerProfileChange, automatic],
  )
  useEffect(() => {
    if (priorAutomatic.current !== automatic) {
      priorAutomatic.current = automatic
      if (run.current) stop("Chế độ AI đã đổi. Bấm Bắt đầu lại.")
    }
  }, [automatic, stop])
  const start = async () => {
    if (run.current || !ui.supportsDubbing) return
    if (
      !automatic &&
      smart?.enabled &&
      (!smart.profile || ui.getSmartProfile?.() !== smart.profile)
    ) {
      setState({ active: false, message: "Chuẩn bị AI trước; xong hãy bấm Bắt đầu lồng tiếng." })
      await smart.prepare()
      return
    }
    const video = ui.getDubbingVideoElement?.()
    if (!video || ad || loading) {
      setState({ active: false, message: "Hãy đợi video chính sẵn sàng rồi bấm lại." })
      return
    }
    if (mode === "translated" && !visible) {
      setState({
        active: false,
        message: "Bật phụ đề của extension trước để có lời dịch, rồi Bắt đầu lồng tiếng.",
      })
      return
    }
    const scope = readIdentity()
    const owner: DubbingSession = {
        abort: new AbortController(),
        boundary: { ...scope, ad, loading },
      },
      route = location.href,
      initialSrc = video.currentSrc
    const { signal } = owner.abort
    run.current = owner
    setState({ active: true, message: "Đang chuẩn bị giọng đọc…" })
    // Unlock the same media element synchronously in the explicit Start gesture.
    try {
      owner.player = new HtmlVoicePlayer()
      await owner.player.unlock()
      signal.throwIfAborted()
      const key = await sendMessage("getOpenAIKeyStatus")
      signal.throwIfAborted()
      if (!key.configured) throw new Error("Chưa cấu hình khóa OpenAI.")
      await ui.ensureSourceTrackPublished()
      signal.throwIfAborted()
      let profileSnapshot: unknown
      let sourceSnapshot: unknown,
        translationSnapshot: unknown,
        cueSnapshot: ReturnType<typeof buildDubbingCues> = []
      const readCues = () => {
        const raw = subtitlesStore.get(studySourceTrackAtom),
          source = raw.length ? raw : subtitlesStore.get(sourceTrackAtom),
          translation = subtitlesStore.get(translatedTrackAtom)
        const profile = ui.getSmartProfile?.() ?? null
        if (
          source !== sourceSnapshot ||
          profile !== profileSnapshot ||
          (mode === "translated" && translation !== translationSnapshot)
        ) {
          profileSnapshot = profile
          sourceSnapshot = source
          translationSnapshot = translation
          cueSnapshot = buildDubbingCues(
            source,
            mode,
            translation,
            profile
              ? (cue) => speakerForCue(profile, source, cue)?.id ?? `unknown:${cue.start}`
              : undefined,
          )
        }
        return cueSnapshot
      }
      // Recheck the exact scope captured in the Start gesture after native loading.
      const valid = () =>
        run.current === owner &&
        !signal.aborted &&
        location.href === route &&
        video.isConnected &&
        ui.getDubbingVideoElement?.() === video &&
        video.currentSrc === initialSrc &&
        sameDubbingScope(readIdentity(), scope) &&
        !subtitlesStore.get(adPlayingAtom) &&
        !subtitlesStore.get(videoLoadingAtom) &&
        (mode !== "translated" || subtitlesStore.get(subtitlesVisibleAtom))
      if (!valid()) throw new Error("Nguồn video đã đổi. Bấm Bắt đầu lại.")
      const { DubbingController } = await import("@/utils/subtitles/dubbing/controller")
      signal.throwIfAborted()
      if (!readCues().length) {
        throw new Error(
          mode === "translated"
            ? "Chưa có lời dịch. Bật phụ đề và chờ dịch câu hiện tại rồi thử lại."
            : "Không có track CC. Với ani.pm hãy chọn SOFT và CC English; HARD không phải dữ liệu phụ đề.",
        )
      }
      const checkKey = async () => {
        const current = await sendMessage("getOpenAIKeyStatus")
        signal.throwIfAborted()
        if (!current.configured || current.revision !== key.revision)
          throw new Error("Khóa OpenAI đã đổi. Bấm Bắt đầu lại.")
      }
      owner.controller = new DubbingController({
        video,
        player: owner.player,
        cues: readCues,
        valid,
        duck: live.current.duck,
        volume: live.current.volume,
        offsetMs: live.current.offsetMs,
        state: (next) => {
          if (run.current !== owner) return
          setState(next)
          if (!next.active) {
            owner.abort.abort()
            clearInterval(owner.timer)
            run.current = null
          }
        },
        generate: async (text, jobSignal, cue) => {
          await checkKey()
          jobSignal.throwIfAborted()
          if (!valid()) throw new DOMException("Source changed", "AbortError")
          const profile = ui.getSmartProfile?.() ?? null
          const source = subtitlesStore.get(studySourceTrackAtom)
          const speaker = cue ? speakerForCue(profile, source, cue) : undefined
          const tts = speaker
            ? {
                ...config.tts.openai,
                voice: speaker.voice,
                speed: speaker.speed,
                instructions: speaker.instructions,
              }
            : { ...config.tts.openai }
          const audio = await createPortStreamPromise<TTSAudioChunk>(
            OPENAI_TTS_FILE_PORT,
            { requestId: getRandomUUID(), text, config: tts },
            { signal: jobSignal },
          )
          await checkKey()
          jobSignal.throwIfAborted()
          if (!valid()) throw new DOMException("Source changed", "AbortError")
          if ((ui.getSmartProfile?.() ?? null) !== profile)
            throw new DOMException("Profile changed", "AbortError")
          return decodeDubbingAudio(audio)
        },
      })
      if (run.current !== owner || signal.aborted) return
      let checking = false
      owner.timer = setInterval(() => {
        if (checking || signal.aborted) return
        checking = true
        void checkKey()
          .catch(() => {
            if (run.current === owner) stop("Khóa OpenAI đã đổi hoặc runtime không còn sẵn sàng.")
          })
          .finally(() => {
            checking = false
          })
      }, 2000)
    } catch (error) {
      if (run.current === owner)
        stop(
          error instanceof NoSubtitlesError
            ? "Chưa có track CC. Trên ani.pm cần SOFT và CC English; không tự nhận dạng âm thanh."
            : error instanceof Error
              ? error.message
              : "Chưa bật được lồng tiếng.",
        )
    }
  }
  return (
    <DubbingContext
      value={{
        state,
        mode,
        duck,
        volume,
        offsetMs,
        model: config.tts.openai.model,
        voice: config.tts.openai.voice,
        changeMode: (next) => {
          stop()
          setMode(next)
        },
        changeDuck: (next) => {
          if (!Number.isFinite(next)) return
          next = Math.max(0, Math.min(1, next))
          live.current.duck = next
          run.current?.controller?.setDuck(next)
          setDuck(next)
        },
        changeVolume: (next) => {
          if (!Number.isFinite(next)) return
          next = Math.max(0, Math.min(1.5, next))
          live.current.volume = next
          run.current?.player?.setVolume(next)
          setVolume(next)
        },
        changeOffset: (next) => {
          if (!Number.isFinite(next)) return
          next = Math.max(-5000, Math.min(5000, Math.round(next / 100) * 100))
          live.current.offsetMs = next
          run.current?.controller?.setOffset(next)
          setOffset(next)
        },
        start: () => void start(),
        stop: () => stop("Đã tắt lồng tiếng.", true),
      }}
    >
      {children}
    </DubbingContext>
  )
}
