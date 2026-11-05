import type { JSONValue } from "ai"
import type { OpenAIPublicConfig } from "@/types/config/openai"
import { openAIPublicConfigSchema } from "@/types/config/openai"
import { resolveModelId } from "./model-id"
import { getRecommendedProviderOptions } from "./options"

/** Pure normalization shared by execution, batches and cache identities. */
export function buildOpenAIGenerateParams(config: OpenAIPublicConfig) {
  const model = resolveModelId(config.model)!
  const recommendation = getRecommendedProviderOptions(model)
  // An explicit reasoning choice wins over the catalog recommendation.
  const providerOptions: Record<string, Record<string, JSONValue>> | undefined =
    config.reasoning === undefined && recommendation ? { openai: recommendation } : undefined
  return { reasoning: config.reasoning, temperature: config.temperature, providerOptions }
}

export function getOpenAIOutputIdentity(input: OpenAIPublicConfig): string {
  const snapshot = openAIPublicConfigSchema.parse(input)
  const params = buildOpenAIGenerateParams(snapshot)
  return JSON.stringify([
    "openai-responses-v1",
    resolveModelId(snapshot.model),
    params.reasoning ?? null,
    params.temperature ?? null,
    params.providerOptions ?? null,
  ])
}
