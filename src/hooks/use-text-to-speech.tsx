import type { TTSConfig } from "@/types/config/tts"
import type { OpenAITTSAudioResult } from "@/types/openai-tts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { toastManager } from "@/components/ui/base-ui/toast"
import { OPENAI_TTS_PORT, OPENAI_TTS_VOICES } from "@/types/openai-tts"
import { createPortStreamPromise } from "@/utils/content-script/port-streaming"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
import { splitTextByUtf8Bytes } from "@/utils/server/edge-tts/chunk"
import { getOpenAIAudio } from "@/utils/tts-playback/openai-audio-cache"
import {
  claimSpeechSynthesis,
  releaseSpeechSynthesis,
  ownsSpeechSynthesis,
} from "@/utils/tts-playback/synthesis-session"

interface PlayAudioParams {
  text: string
  ttsConfig: TTSConfig
  forcedVoice?: string
  // A run nobody pressed for (a layout reading a field as the answer arrives)
  // fails without a toast; pressing the trigger tries again and reports it.
  quiet?: boolean
}

interface SynthesizedAudioChunk {
  audioBase64: string
  contentType: string
}

const TTS_ERROR_TOAST_ID = "tts-synthesize-error"

export function selectTTSVoice(
  ttsConfig: TTSConfig,
  detectedLanguage?: string | null,
  forcedVoice?: string,
): string {
  if (ttsConfig.provider === "openai") {
    return forcedVoice && (OPENAI_TTS_VOICES as readonly string[]).includes(forcedVoice)
      ? forcedVoice
      : ttsConfig.openai.voice
  }
  if (forcedVoice) {
    return forcedVoice
  }

  if (detectedLanguage && detectedLanguage in ttsConfig.languageVoices) {
    return (
      ttsConfig.languageVoices[detectedLanguage as keyof typeof ttsConfig.languageVoices] ??
      ttsConfig.defaultVoice
    )
  }

  return ttsConfig.defaultVoice
}

function getTTSFriendlyErrorDescription(error: Error): string | undefined {
  if (error.message.includes("Edge TTS returned empty audio data")) {
    return "The current voice may not support this language. Try switching to a matching voice."
  }

  if (error.message.includes("[SYNTH_RATE_LIMITED]")) {
    return "Too many TTS requests. Please try again in a moment."
  }

  if (
    error.message.includes("[NETWORK_ERROR]") ||
    error.message.includes("[TOKEN_FETCH_FAILED]") ||
    error.message.includes("[TOKEN_INVALID]")
  ) {
    return "Edge TTS is temporarily unavailable. Please check your network and retry."
  }

  return error.message || undefined
}

export function useTextToSpeech() {
  const queryClient = useQueryClient()
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentChunk, setCurrentChunk] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const shouldStopRef = useRef(false)
  const activeRequestIdRef = useRef<string | null>(null)
  const synthesisControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const release = () => {
      synthesisControllerRef.current?.abort()
      const requestId = activeRequestIdRef.current
      activeRequestIdRef.current = null
      shouldStopRef.current = true
      releaseSpeechSynthesis(requestId)
      if (requestId) void sendMessage("ttsPlaybackStop", { requestId }).catch(() => {})
    }
    window.addEventListener("pagehide", release)
    return () => {
      window.removeEventListener("pagehide", release)
      release()
    }
  }, [])

  const stop = () => {
    shouldStopRef.current = true

    const activeRequestId = activeRequestIdRef.current
    synthesisControllerRef.current?.abort()
    releaseSpeechSynthesis(activeRequestId)
    activeRequestIdRef.current = null
    if (activeRequestId) {
      void sendMessage("ttsPlaybackStop", { requestId: activeRequestId }).catch(() => {})
    }

    setIsPlaying(false)
    setCurrentChunk(0)
    setTotalChunks(0)
  }

  const playMutation = useMutation<void, Error, PlayAudioParams>({
    meta: {
      suppressToast: true,
    },
    mutationFn: async ({ text, ttsConfig, forcedVoice }) => {
      stop()
      shouldStopRef.current = false

      const requestId = getRandomUUID()
      const controller = new AbortController()
      synthesisControllerRef.current = controller
      claimSpeechSynthesis(requestId, controller)
      activeRequestIdRef.current = requestId
      // A newer play() resets shouldStopRef, so a run still awaiting a fetch
      // must also check that it is still the active request; otherwise it
      // would resume, start its audio over the newer one and flip its state.
      const isSuperseded = () =>
        controller.signal.aborted ||
        shouldStopRef.current ||
        activeRequestIdRef.current !== requestId ||
        !ownsSpeechSynthesis(requestId)
      try {
        await sendMessage("ttsPlaybackPrepare", { requestId })
        if (isSuperseded()) return
        await runPlayback(requestId, isSuperseded, {
          text,
          ttsConfig,

          forcedVoice,
          signal: controller.signal,
        })
      } catch (error) {
        // A run the user already stopped or replaced reports nothing.
        if (isSuperseded() || (error instanceof DOMException && error.name === "AbortError")) return
        throw error
      } finally {
        controller.abort()
        releaseSpeechSynthesis(requestId)
        if (activeRequestIdRef.current === requestId) {
          activeRequestIdRef.current = null
          setIsPlaying(false)
          setCurrentChunk(0)
          setTotalChunks(0)
        }
      }
    },
    onError: (error, variables) => {
      if (!variables.quiet) {
        toastManager.add({
          type: "error",
          title: i18n.t("speak.failedToGenerateSpeech"),
          id: TTS_ERROR_TOAST_ID,
          description: getTTSFriendlyErrorDescription(error),
        })
      }
      activeRequestIdRef.current = null
      setIsPlaying(false)
      setCurrentChunk(0)
      setTotalChunks(0)
    },
  })

  async function runPlayback(
    requestId: string,
    isSuperseded: () => boolean,
    { text, ttsConfig, forcedVoice, signal }: PlayAudioParams & { signal: AbortSignal },
  ) {
    // Legacy Microsoft settings remain importable, but runtime speech is OpenAI-only.
    const selectedVoice = selectTTSVoice(
      { ...ttsConfig, provider: "openai" },
      undefined,
      forcedVoice,
    )
    const keyStatus = await sendMessage("getOpenAIKeyStatus", undefined)
    if (isSuperseded()) return
    if (!keyStatus.configured) throw new Error("Configure an OpenAI API key in settings.")
    const chunks = splitTextByUtf8Bytes(text, 1800)
    setTotalChunks(chunks.length)
    const fetchChunkAudio = async (chunk: string) => {
      signal.throwIfAborted()
      const config = { ...ttsConfig.openai, voice: selectedVoice as typeof ttsConfig.openai.voice }
      return getOpenAIAudio(queryClient, chunk, config, keyStatus.revision, signal, async () => {
        const audio = await createPortStreamPromise<OpenAITTSAudioResult>(
          OPENAI_TTS_PORT,
          { requestId, text: chunk, config },
          { signal },
        )
        signal.throwIfAborted()
        if ("cancelled" in audio) throw new DOMException("Speech request superseded", "AbortError")
        return audio
      })
    }

    const playChunk = async (audioChunk: SynthesizedAudioChunk): Promise<boolean> => {
      // isPlaying belongs to the active run; a superseded one leaves it alone.
      if (!isSuperseded()) setIsPlaying(true)
      try {
        const playbackResult = await sendMessage("ttsPlaybackStart", {
          requestId,
          audioBase64: audioChunk.audioBase64,
          contentType: audioChunk.contentType,
        })
        if (playbackResult.ok) {
        }
        return playbackResult.ok
      } finally {
        if (activeRequestIdRef.current === requestId) setIsPlaying(false)
      }
    }

    for (let index = 0; index < chunks.length; index++) {
      if (isSuperseded()) {
        break
      }

      setCurrentChunk(index + 1)
      const currentAudioPromise = fetchChunkAudio(chunks[index]!)
      const nextAudioPromise =
        index + 1 < chunks.length ? fetchChunkAudio(chunks[index + 1]!) : null
      // Observe a prefetched rejection immediately, including cancellation;
      // awaiting it after the current playback below still preserves failures.
      void nextAudioPromise?.catch(() => {})
      const audioChunk = await currentAudioPromise

      if (isSuperseded()) {
        break
      }

      const didPlay = await playChunk(audioChunk)
      if (!didPlay || isSuperseded()) {
        break
      }

      if (nextAudioPromise) {
        await nextAudioPromise
      }
    }

    if (activeRequestIdRef.current === requestId) {
      activeRequestIdRef.current = null
      setCurrentChunk(0)
      setTotalChunks(0)
    }
  }

  const play = (
    text: string,
    ttsConfig: TTSConfig,
    options?: {
      forcedVoice?: string
      quiet?: boolean
    },
  ) => {
    return playMutation.mutateAsync({
      text,
      ttsConfig: structuredClone(ttsConfig),
      forcedVoice: options?.forcedVoice,
      quiet: options?.quiet,
    })
  }

  const isFetching = playMutation.isPending && !isPlaying

  return {
    play,
    stop,
    isFetching,
    isPlaying,
    currentChunk,
    totalChunks,
    error: playMutation.error,
  }
}
