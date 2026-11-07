import type { TTSAudioChunk } from "@/types/openai-tts"
import { useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useEffect, useRef, useState } from "react"
import { toastManager } from "@/components/ui/base-ui/toast"
import { OPENAI_TTS_EXPORT_MAX_TEXT_LENGTH, OPENAI_TTS_FILE_PORT } from "@/types/openai-tts"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { createPortStreamPromise } from "@/utils/content-script/port-streaming"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
import { splitTextByUtf8Bytes } from "@/utils/server/edge-tts/chunk"
import { getOpenAIAudio } from "@/utils/tts-playback/openai-audio-cache"

type Progress = {
  phase: "generating" | "encoding" | "saving"
  current: number
  total: number
} | null

export function useOpenAITTSDownload(text: string | undefined) {
  const tts = useAtomValue(configFieldsAtomMap.tts)
  const client = useQueryClient()
  const run = useRef<{ controller: AbortController; identity: string } | null>(null)
  const [state, setState] = useState<{ identity: string; progress: Progress } | null>(null)
  const identity = JSON.stringify([text, tts.provider, tts.openai])
  const progress = state?.identity === identity ? state.progress : null
  useEffect(() => {
    const abort = () => {
      if (run.current?.identity === identity) {
        run.current.controller.abort()
        run.current = null
      }
    }
    window.addEventListener("pagehide", abort)
    return () => {
      window.removeEventListener("pagehide", abort)
      abort()
    }
  }, [identity])

  const cancel = () => {
    if (progress?.phase === "saving") return
    run.current?.controller.abort()
    run.current = null
    setState(null)
  }
  const download = async () => {
    if (run.current || tts.provider !== "openai" || !text?.trim()) return
    if (text.length > OPENAI_TTS_EXPORT_MAX_TEXT_LENGTH) {
      toastManager.add({
        type: "error",
        title: i18n.t("openaiTts.downloadTooLong", [String(OPENAI_TTS_EXPORT_MAX_TEXT_LENGTH)]),
      })
      return
    }
    const controller = new AbortController(),
      { signal } = controller
    run.current = { controller, identity }
    const setProgress = (next: Progress) => setState({ identity, progress: next })
    const config = { ...tts.openai }
    try {
      const chunks = splitTextByUtf8Bytes(text.trim(), 1800)
      setProgress({ phase: "generating", current: 0, total: chunks.length })
      const status = await sendMessage("getOpenAIKeyStatus")
      signal.throwIfAborted()
      if (!status.configured) throw new Error("OpenAI key is missing")
      const audio: Uint8Array[] = []
      let size = 0
      // Lazy loading keeps the MP3 encoder off normal selection/playback startup.
      const { encodeSpeechMp3, MAX_TTS_EXPORT_AUDIO_BYTES } =
        await import("@/utils/tts-playback/mp3-download")
      for (const [index, chunk] of chunks.entries()) {
        signal.throwIfAborted()
        const part = await getOpenAIAudio(client, chunk, config, status.revision, signal, () =>
          createPortStreamPromise<TTSAudioChunk>(
            OPENAI_TTS_FILE_PORT,
            { requestId: getRandomUUID(), text: chunk, config },
            { signal },
          ),
        )
        signal.throwIfAborted()
        if (part.contentType !== "audio/wav" || part.audioBase64.length > 12 * 1024 * 1024)
          throw new Error("Invalid speech audio")
        size += Math.floor((part.audioBase64.length * 3) / 4)
        if (size > MAX_TTS_EXPORT_AUDIO_BYTES) throw new Error("Speech audio is too large")
        audio.push(Uint8Array.from(atob(part.audioBase64), (character) => character.charCodeAt(0)))
        setProgress({ phase: "generating", current: index + 1, total: chunks.length })
      }
      setProgress({ phase: "encoding", current: chunks.length, total: chunks.length })
      const bytes = await encodeSpeechMp3(audio, signal)
      const currentStatus = await sendMessage("getOpenAIKeyStatus")
      signal.throwIfAborted()
      if (!currentStatus.configured || currentStatus.revision !== status.revision)
        throw new Error("OpenAI credential changed")
      let binary = ""
      for (let offset = 0; offset < bytes.length; offset += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
      signal.throwIfAborted()
      setProgress({ phase: "saving", current: chunks.length, total: chunks.length })
      await sendMessage("downloadOpenAITTSMp3", { audioBase64: btoa(binary) })
    } catch {
      if (!signal.aborted)
        toastManager.add({ type: "error", title: i18n.t("openaiTts.downloadFailed") })
    } finally {
      if (run.current?.controller === controller) {
        run.current = null
        setProgress(null)
      }
    }
  }
  return { download, cancel, progress, available: tts.provider === "openai" }
}
