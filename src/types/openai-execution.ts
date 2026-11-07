import { z } from "zod"
import { usageTaskSchema } from "@/utils/usage/schema"
import {
  OPENAI_PROVIDER_ID,
  openAIPublicConfigSchema,
  publicProviderRefSchema,
} from "./config/openai"
import { imageDataURLSchema } from "./image-translation"

export const openAITextPayloadSchema = z.strictObject({
  providerKind: z.literal("local"),
  providerId: z.literal(OPENAI_PROVIDER_ID),
  providerConfig: openAIPublicConfigSchema,
  instructions: z.string().max(262144),
  prompt: z.string().max(1048576),
  maxOutputTokens: z.number().int().positive().max(32768).optional(),
  usageTask: usageTaskSchema.optional(),
})

export const openAIStructuredPayloadSchema = openAITextPayloadSchema.extend({
  outputSchema: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(256),
        type: z.enum(["string", "number"]),
      }),
    )
    .min(1)
    .max(128)
    .refine((fields) => new Set(fields.map((field) => field.name)).size === fields.length),
})

export const openAIImagePayloadSchema = openAITextPayloadSchema.extend({
  image: imageDataURLSchema,
})

export const openAIGeneratePayloadSchema = z.strictObject({
  providerRef: publicProviderRefSchema,
  instructions: z.string().max(262144),
  prompt: z.string().max(1048576),
  usageTask: usageTaskSchema.optional(),
})
