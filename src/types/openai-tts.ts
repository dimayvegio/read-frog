import { z } from "zod"

export const OPENAI_TTS_MODELS = ["gpt-realtime-2.1-mini", "gpt-4o-mini-tts"] as const
export const OPENAI_TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const
export const OPENAI_TTS_PORT = "openai-tts"
export const OPENAI_TTS_FILE_PORT = "openai-tts-file"
export const OPENAI_TTS_EXPORT_MAX_TEXT_LENGTH = 20000
export const OPENAI_TTS_MAX_TEXT_LENGTH = 4000

export const openAITTSConfigSchema = z.strictObject({
  model: z.enum(OPENAI_TTS_MODELS),
  voice: z.enum(OPENAI_TTS_VOICES),
  speed: z.number().min(0.25).max(1.5),
  instructions: z.string().max(1000),
})
export type OpenAITTSConfig = z.infer<typeof openAITTSConfigSchema>
export const DEFAULT_OPENAI_TTS_CONFIG: OpenAITTSConfig = {
  model: "gpt-realtime-2.1-mini",
  voice: "marin",
  speed: 1,
  instructions: "",
}
export const openAITTSPayloadSchema = z.strictObject({
  requestId: z.string().min(1).max(256),
  text: z.string().trim().min(1).max(OPENAI_TTS_MAX_TEXT_LENGTH),
  config: openAITTSConfigSchema,
})
export type OpenAITTSPayload = z.infer<typeof openAITTSPayloadSchema>
export interface TTSAudioChunk {
  audioBase64: string
  contentType: string
}
export type OpenAITTSAudioResult = TTSAudioChunk | { cancelled: true }
