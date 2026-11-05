import type { z } from "zod"
import type { openAIGeneratePayloadSchema } from "./openai-execution"
export type BackgroundGenerateTextPayload = z.infer<typeof openAIGeneratePayloadSchema>
export interface BackgroundGenerateTextResponse {
  text: string
}
