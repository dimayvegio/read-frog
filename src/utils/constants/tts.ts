import type { TTSConfig } from "@/types/config/tts"
import { createDefaultTTSLanguageVoices, EDGE_TTS_FALLBACK_VOICE } from "@/types/config/tts"
import { DEFAULT_OPENAI_TTS_CONFIG } from "@/types/openai-tts"

export const DEFAULT_TTS_CONFIG: TTSConfig = {
  provider: "microsoft",
  openai: { ...DEFAULT_OPENAI_TTS_CONFIG },
  defaultVoice: EDGE_TTS_FALLBACK_VOICE,
  languageVoices: createDefaultTTSLanguageVoices(),
  rate: 0,
  pitch: 0,
  volume: 0,
}
