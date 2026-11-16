import type { OpenAIPublicConfig } from "@/types/config/openai"
import type { ProviderConfig, ProvidersConfig } from "@/types/config/provider"
import type { FeatureModelKey } from "@/types/feature-models"
import type { FeatureKey } from "@/utils/constants/feature-providers"
import { openAIPublicConfigSchema } from "@/types/config/openai"
import { applyFeatureModelOverride, getFeatureModelSync } from "@/utils/feature-models/resolver"

export type ProviderCapability =
  | FeatureKey
  | "customAction"
  | "languageDetection"
  | "pdfTranslation"
  | "imageTranslate"
export interface LocalProviderRef<T extends ProviderConfig = OpenAIPublicConfig> {
  kind: "local"
  config: T
  id: string
  name: string
}
export type ResolvedProviderRef<T extends ProviderConfig = OpenAIPublicConfig> = LocalProviderRef<T>
export type ProviderConfigForCapability<_C extends ProviderCapability> = OpenAIPublicConfig
export type ProviderRefForCapability<_C extends ProviderCapability> = LocalProviderRef
export type CustomActionProviderRef = ProviderRefForCapability<"customAction">
export type SelectionTranslationProviderRef = ProviderRefForCapability<"selectionTranslation">

export function isLocalProviderConfigCompatibleWithCapability(
  _capability: ProviderCapability,
  provider: ProviderConfig,
): provider is OpenAIPublicConfig {
  return openAIPublicConfigSchema.safeParse(provider).success
}
export function getProviderIdsForCapability(
  _capability: ProviderCapability,
  providers: ProvidersConfig,
  _options: { requireEnable?: boolean } = {},
): string[] {
  return providers
    .filter((provider) => openAIPublicConfigSchema.safeParse(provider).success)
    .map((provider) => provider.id)
}
export function doesProviderSupportsCapability(
  capability: ProviderCapability,
  providers: ProvidersConfig,
  providerId: string,
  options: { requireEnable?: boolean } = {},
): boolean {
  return getProviderIdsForCapability(capability, providers, options).includes(providerId)
}
export function getSelectableProvidersForCapability(
  _capability: ProviderCapability,
  providers: ProvidersConfig,
): OpenAIPublicConfig[] {
  return providers.flatMap((provider) => {
    const result = openAIPublicConfigSchema.safeParse(provider)
    return result.success ? [result.data] : []
  })
}
const resolvedFeatures = new WeakMap<LocalProviderRef, FeatureModelKey>()
export const getResolvedFeatureKey = (provider: LocalProviderRef) => resolvedFeatures.get(provider)
export function resolveProviderRefForCapability<C extends ProviderCapability>(
  capability: C,
  providers: ProvidersConfig,
  providerId: string,
): ProviderRefForCapability<C> | null {
  const parsed = openAIPublicConfigSchema.safeParse(
    providers.find((provider) => provider.id === providerId),
  )
  if (!parsed.success) return null
  const keys: Partial<Record<ProviderCapability, FeatureModelKey>> = {
    pageTranslation: "webTranslate",
    pdfTranslation: "webTranslate",
    selectionTranslation: "selectionTranslate",
    inputTranslation: "selectionTranslate",
    customAction: "aiExplanation",
    videoSubtitles: "videoSubtitles",
    imageTranslate: "imageTranslate",
  }
  const featureModelKey = keys[capability]
  const config =
    featureModelKey && typeof document !== "undefined"
      ? applyFeatureModelOverride(parsed.data, getFeatureModelSync(featureModelKey))
      : parsed.data
  const result: LocalProviderRef = {
    kind: "local",
    config,
    id: parsed.data.id,
    name: parsed.data.name,
  }
  if (featureModelKey) resolvedFeatures.set(result, featureModelKey)
  return result
}
