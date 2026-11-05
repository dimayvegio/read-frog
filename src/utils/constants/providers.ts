import type { ProvidersConfig } from "@/types/config/provider"
import logo from "@/assets/providers/openai.svg?url&no-inline"
import { DEFAULT_OPENAI_CONFIG } from "@/types/config/openai"

export const DEFAULT_LLM_PROVIDER_MODELS = { openai: DEFAULT_OPENAI_CONFIG.model }
export const DEFAULT_PROVIDER_CONFIG = { openai: DEFAULT_OPENAI_CONFIG }
export const DEFAULT_PROVIDER_CONFIG_LIST: ProvidersConfig = [DEFAULT_OPENAI_CONFIG]
export const PROVIDER_ITEMS = { openai: { name: "OpenAI", logo: () => logo } }
export function buildDefaultProviderConfigList(): ProvidersConfig {
  return [structuredClone(DEFAULT_OPENAI_CONFIG)]
}
