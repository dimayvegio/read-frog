import type { OpenAIPublicConfig } from "@/types/config/openai"
import type { Theme } from "@/types/config/theme"
import logo from "@/assets/providers/openai.svg?url&no-inline"
export type ProviderSelectorOption = OpenAIPublicConfig
export function getProviderLogo(_provider: ProviderSelectorOption, _theme: Theme): string {
  return logo
}
export function getProviderName(provider: ProviderSelectorOption): string {
  return provider.name
}
