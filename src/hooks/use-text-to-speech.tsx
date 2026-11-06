import type { TTSConfig } from "@/types/config/tts"
import type { OpenAITTSAudioResult } from "@/types/openai-tts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useAtomValue } from "jotai"
import { useEffect, useRef, useState } from "react"
import { toastManager } from "@/components/ui/base-ui/toast"
import { OPENAI_TTS_PORT, OPENAI_TTS_VOICES } from "@/types/openai-tts"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { createPortStreamPromise } from "@/utils/content-script/port-streaming"
import { detectLanguage } from "@/utils/content/language"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { i18n } from "@/utils/i18n"
import { logger } from "@/utils/logger"
import { sendMessage } from "@/utils/message"
import { splitTextByUtf8Bytes } from "@/utils/server/edge-tts/chunk"
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

function toSignedValue(value: number, unit: "%" | "Hz"): string {
  return `${value >= 0 ? "+" : ""}${value}${unit}`
}

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

async function resolveVoiceForText(
  text: string,
  ttsConfig: TTSConfig,
  enableLLM: boolean,
  forcedVoice?: string,
): Promise<string> {
  if (forcedVoice) {
    logger.info("[TextToSpeech] Using forced voice for text", {
      text,
      forcedVoice,
    })
    return forcedVoice
  }

  const detectedLanguage = await detectLanguage(text, {
    minLength: 0,
    enableLLM,
    // Voice detection can fall back without blocking speech. Tell the user
    // what happened and how to choose a working detection mode.
    llmFallbackToastContext: "speak",
  })
  logger.info("[TextToSpeech] Resolving voice for text", {
    text,
    detectedLanguage,
    enableLLM,
  })

  return selectTTSVoice(ttsConfig, detectedLanguage)
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

async function synthesizeEdgeTTSAudioChunk(
  chunk: string,
  voice: string,
  ttsConfig: TTSConfig,
): Promise<SynthesizedAudioChunk> {
  const response = await sendMessage("edgeTtsSynthesize", {
    text: chunk,
    voice,
    rate: toSignedValue(ttsConfig.rate, "%"),
    pitch: toSignedValue(ttsConfig.pitch, "Hz"),
    volume: toSignedValue(ttsConfig.volume, "%"),
  })

  if (!response.ok) {
    throw new Error(`[${response.error.code}] ${response.error.message}`)
  }

  if (!response.audioBase64) {
    throw new Error("Edge TTS returned empty audio data")
  }

  return {
    audioBase64: response.audioBase64,
    contentType: response.contentType,
  }
}

export function useTextToSpeech() {
  const queryClient = useQueryClient()
  const languageDetection = useAtomValue(configFieldsAtomMap.languageDetection)
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
    const openai = ttsConfig.provider === "openai"
    const selectedVoice = openai
      ? selectTTSVoice(ttsConfig, undefined, forcedVoice)
      : await resolveVoiceForText(text, ttsConfig, languageDetection.mode === "llm", forcedVoice)
    if (isSuperseded()) {
      return
    }
    const keyStatus = openai ? await sendMessage("getOpenAIKeyStatus", undefined) : null
    if (isSuperseded()) return
    if (openai && !keyStatus?.configured)
      throw new Error("Configure an OpenAI API key in settings.")
    const chunks = openai ? splitTextByUtf8Bytes(text, 1800) : splitTextByUtf8Bytes(text)
    setTotalChunks(chunks.length)
    if (isSuperseded()) {
      return
    }

    const fetchChunkAudio = async (chunk: string) => {
      if (openai) {
        signal.throwIfAborted()
        const config = {
          ...ttsConfig.openai,
          voice: selectedVoice as typeof ttsConfig.openai.voice,
        }
        const cacheKey = [
          "tts-audio",
          "openai",
          { text: chunk, ...config, credentialRevision: keyStatus!.revision },
        ]
        const cached = queryClient.getQueryData<SynthesizedAudioChunk>(cacheKey)
        if (cached) return cached
        const audio = await createPortStreamPromise<OpenAITTSAudioResult>(
          OPENAI_TTS_PORT,
          { requestId, text: chunk, config },
          { signal },
        )
        signal.throwIfAborted()
        if ("cancelled" in audio) throw new DOMException("Speech request superseded", "AbortError")
        queryClient.setQueryData(cacheKey, audio)
        return audio
      }
      logger.info("[TextToSpeech] Fetching chunk audio", {
        text: chunk,
        voice: selectedVoice,
        rate: ttsConfig.rate,
        pitch: ttsConfig.pitch,
        volume: ttsConfig.volume,
      })
      return queryClient.fetchQuery({
        queryKey: [
          "tts-audio",
          {
            text: chunk,
            voice: selectedVoice,
            rate: ttsConfig.rate,
            pitch: ttsConfig.pitch,
            volume: ttsConfig.volume,
          },
        ],
        queryFn: () => synthesizeEdgeTTSAudioChunk(chunk, selectedVoice, ttsConfig),
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: 1000 * 60 * 10,
        meta: {
          suppressToast: true,
        },
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
