export { LLM_PROVIDER_MODELS } from "@/utils/constants/models"
export const ALL_PROVIDER_TYPES = ["openai"] as const
export const API_PROVIDER_TYPES = ALL_PROVIDER_TYPES
export const LLM_PROVIDER_TYPES = ALL_PROVIDER_TYPES
export const TRANSLATE_PROVIDER_TYPES = ALL_PROVIDER_TYPES
export type AllProviderTypes = "openai"
export type APIProviderTypes = "openai"
export type LLMProviderTypes = "openai"
export type TranslateProviderTypes = "openai"
export const isLLMProvider = (provider: string): provider is LLMProviderTypes =>
  provider === "openai"
export const isAPIProvider = isLLMProvider
export const isTranslateProvider = isLLMProvider
export const AI_SDK_REASONING_VALUES = [
  "provider-default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const
export type AISDKReasoning = (typeof AI_SDK_REASONING_VALUES)[number]
