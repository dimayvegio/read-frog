import type { OpenAIPublicConfig } from "../openai"
import { z } from "zod"
import { openAIPublicConfigSchema, openAIProvidersConfigSchema } from "../openai"

export const providerConfigItemSchema = openAIPublicConfigSchema
export const llmProviderConfigItemSchema = openAIPublicConfigSchema
export const apiProviderConfigItemSchema = openAIPublicConfigSchema
export const providersConfigSchema = openAIProvidersConfigSchema
export type ProviderConfig = OpenAIPublicConfig
export type APIProviderConfig = OpenAIPublicConfig
export type LLMProviderConfig = OpenAIPublicConfig
export type TranslateProviderConfig = OpenAIPublicConfig
export type ProvidersConfig = OpenAIPublicConfig[]
export const llmProviderModelsSchema = z.object({ openai: openAIPublicConfigSchema.shape.model })
export type LLMProviderModels = z.infer<typeof llmProviderModelsSchema>
