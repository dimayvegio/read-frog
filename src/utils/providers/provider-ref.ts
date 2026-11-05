import type { ResolvedProviderRef } from "./provider-registry"
import type { Config } from "@/types/config/config"
import type { OpenAIPublicConfig } from "@/types/config/openai"
import { openAIPublicConfigSchema, publicProviderRefSchema } from "@/types/config/openai"
import { getOpenAIOutputIdentity } from "./openai-profile"
import { resolveProviderRefForCapability } from "./provider-registry"
import { ProviderSetupError } from "./provider-setup-error"

export type SerializableProviderRef = { kind: "local"; config: OpenAIPublicConfig }
export type PromptableProviderRef = SerializableProviderRef
export function resolvePageTranslationProviderOrNull(config: Config) {
  return resolveProviderRefForCapability(
    "pageTranslation",
    config.providersConfig,
    config.pageTranslation.providerId,
  )
}
export function resolvePageTranslationProvider(config: Config) {
  const provider = resolvePageTranslationProviderOrNull(config)
  if (!provider) throw new ProviderSetupError("Configure OpenAI in settings")
  return provider
}
export function getProviderCacheIdentity(ref: SerializableProviderRef): string {
  return getOpenAIOutputIdentity(publicProviderRefSchema.parse(ref).config)
}
export function canProviderRefGenerateText(
  ref: SerializableProviderRef,
): ref is PromptableProviderRef {
  return publicProviderRefSchema.safeParse(ref).success
}
export function canResolvedProviderRefGenerateText(
  ref: ResolvedProviderRef,
): ref is ResolvedProviderRef {
  return openAIPublicConfigSchema.safeParse(ref.config).success
}
export async function serializeProviderRef(
  provider: ResolvedProviderRef,
  _route?: string,
): Promise<SerializableProviderRef> {
  return publicProviderRefSchema.parse({ kind: provider.kind, config: provider.config })
}
export type ProviderAvailability<Ref extends SerializableProviderRef = SerializableProviderRef> =
  | { available: true; providerRef: Ref }
  | { available: false; message: string }
export async function checkProviderAvailability(
  provider: ResolvedProviderRef,
  route?: string,
): Promise<ProviderAvailability> {
  const providerRef = await serializeProviderRef(provider, route)
  return { available: true, providerRef }
}
