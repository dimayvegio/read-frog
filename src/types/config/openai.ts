import { z } from "zod"
import { LLM_PROVIDER_MODELS } from "@/utils/constants/models"

export const OPENAI_PROVIDER_ID = "openai-default" as const

export const openAIPublicConfigSchema = z.strictObject({
  id: z.literal(OPENAI_PROVIDER_ID),
  provider: z.literal("openai"),
  name: z.string().trim().min(1),
  enabled: z.literal(true),
  model: z
    .strictObject({
      model: z.enum(LLM_PROVIDER_MODELS.openai),
      isCustomModel: z.boolean(),
      customModel: z.string().trim().min(1).nullable(),
    })
    .refine((model) => !model.isCustomModel || !!model.customModel, {
      message: "Enter an OpenAI model ID",
    }),
  temperature: z.number().min(0).max(2).optional(),
  reasoning: z
    .enum(["provider-default", "none", "minimal", "low", "medium", "high", "xhigh"])
    .optional(),
})

export type OpenAIPublicConfig = z.infer<typeof openAIPublicConfigSchema>

export const openAIProvidersConfigSchema = z.array(openAIPublicConfigSchema).length(1)

export const DEFAULT_OPENAI_CONFIG: OpenAIPublicConfig = {
  id: OPENAI_PROVIDER_ID,
  provider: "openai",
  name: "OpenAI",
  enabled: true,
  model: { model: "gpt-6-luna", isCustomModel: false, customModel: null },
}

export const publicProviderRefSchema = z.strictObject({
  kind: z.literal("local"),
  config: openAIPublicConfigSchema,
})

export interface OpenAIKeyStatus {
  configured: boolean
  revision: number
  requiresReentry: boolean
  recoveryBackupCount?: number
}

export type InitialConfigResult<T> =
  | { ok: true; config: T; schemaVersion: number }
  | {
      ok: false
      code: "STORAGE_UNAVAILABLE" | "UNSUPPORTED_SCHEMA" | "MIGRATION_FAILED" | "CLEANUP_FAILED"
      retryable: boolean
    }

export interface OpenAIConnectionResult {
  ok: boolean
  code?: "NOT_CONFIGURED" | "AUTHENTICATION_FAILED" | "RATE_LIMITED" | "CONNECTION_FAILED"
  credentialRevision: number
  snapshotIdentity: string
}
