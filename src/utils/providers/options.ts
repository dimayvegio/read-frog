import type { JSONValue } from "ai"
import { LLM_MODEL_OPTIONS } from "@/utils/constants/models"

export function getRecommendedProviderOptionsMatch(
  model: string,
): { matchIndex: number; options: Record<string, JSONValue> } | undefined {
  for (const [matchIndex, entry] of LLM_MODEL_OPTIONS.entries()) {
    if (entry.pattern.test(model)) return { matchIndex, options: entry.options }
  }
  return undefined
}
export function getRecommendedProviderOptions(
  model: string,
): Record<string, JSONValue> | undefined {
  return getRecommendedProviderOptionsMatch(model)?.options
}
