import type { Config } from "@/types/config/config"

/** OpenAI preserves the HTML protocol used by both page translation modes. */
export function providerSupportsTranslationOnlyMode(provider: string): boolean {
  return provider === "openai"
}

export function getTranslationOnlyBlockedReason(_config: Config): string | null {
  return null
}
