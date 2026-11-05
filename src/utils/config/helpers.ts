import type { Config } from "@/types/config/config"
import type { ProviderConfig, ProvidersConfig } from "@/types/config/provider"
import { isLLMProviderConfig } from "@/types/config/provider"

export function getProviderConfigById<T extends ProviderConfig>(
  providers: T[],
  id: string,
): T | undefined {
  return providers.find((provider) => provider.id === id)
}
export function getLLMProvidersConfig(providers: ProvidersConfig): ProviderConfig[] {
  return providers.filter(isLLMProviderConfig)
}
export const getAPIProvidersConfig = getLLMProvidersConfig
export const getTranslateProvidersConfig = getLLMProvidersConfig
export function filterEnabledProvidersConfig(providers: ProvidersConfig): ProvidersConfig {
  return providers.filter((provider) => provider.enabled)
}
export const getEnabledLLMProvidersConfig = getLLMProvidersConfig
export function getProviderKeyByName(providers: ProvidersConfig, id: string): string | undefined {
  return getProviderConfigById(providers, id)?.provider
}
export function getProviderModelConfig(config: Config, id: string) {
  return getProviderConfigById(config.providersConfig, id)?.model
}
