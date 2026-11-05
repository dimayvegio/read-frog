import type { OpenAIPublicConfig } from "../openai"
import { openAIPublicConfigSchema } from "../openai"
export * from "./constants"
export * from "./schemas"

export function isLLMProviderConfig(config: unknown): config is OpenAIPublicConfig {
  return openAIPublicConfigSchema.safeParse(config).success
}
export const isAPIProviderConfig = isLLMProviderConfig
export const isTranslateProviderConfig = isLLMProviderConfig
