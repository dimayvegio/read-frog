import type { ProviderCapability } from "./provider-registry"
import type { ProvidersConfig } from "@/types/config/provider"
import { getProviderIdsForCapability } from "./provider-registry"

export function getUsableProviderIdsForCapability(
  capability: ProviderCapability,
  providers: ProvidersConfig,
  _legacyStatus?: unknown,
): string[] {
  return getProviderIdsForCapability(capability, providers, { requireEnable: true })
}
