import { describe, expect, it } from "vitest"
import {
  DEFAULT_OPENAI_CONFIG,
  openAIPublicConfigSchema,
  openAIProvidersConfigSchema,
} from "@/types/config/openai"
import { openAITextPayloadSchema } from "@/types/openai-execution"
import { buildOpenAIGenerateParams, getOpenAIOutputIdentity } from "../openai-profile"

describe("public OpenAI contract", () => {
  it.each(["apiKey", "baseURL", "headers", "providerOptions", "url", "providerSpecificSettings"])(
    "rejects %s at execution boundaries",
    (field) => {
      expect(
        openAIPublicConfigSchema.safeParse({
          ...DEFAULT_OPENAI_CONFIG,
          [field]: "private-sentinel",
        }).success,
      ).toBe(false)
    },
  )
  it("requires exactly one canonical enabled OpenAI provider", () => {
    for (const input of [
      [],
      [DEFAULT_OPENAI_CONFIG, DEFAULT_OPENAI_CONFIG],
      [{ ...DEFAULT_OPENAI_CONFIG, provider: "google" }],
      [{ ...DEFAULT_OPENAI_CONFIG, id: "other" }],
      [{ ...DEFAULT_OPENAI_CONFIG, enabled: false }],
    ]) {
      expect(openAIProvidersConfigSchema.safeParse(input).success).toBe(false)
    }
  })
  it("requires snapshots and rejects detached SDK overrides", () => {
    const payload = {
      providerKind: "local",
      providerId: "openai-default",
      instructions: "",
      prompt: "sample",
    }
    expect(openAITextPayloadSchema.safeParse(payload).success).toBe(false)
    expect(
      openAITextPayloadSchema.safeParse({ ...payload, providerConfig: DEFAULT_OPENAI_CONFIG })
        .success,
    ).toBe(true)
    expect(
      openAITextPayloadSchema.safeParse({
        ...payload,
        providerConfig: DEFAULT_OPENAI_CONFIG,
        model: "other",
      }).success,
    ).toBe(false)
  })
  it("ignores labels and dormant custom model values in output identity", () => {
    expect(getOpenAIOutputIdentity(DEFAULT_OPENAI_CONFIG)).toBe(
      getOpenAIOutputIdentity({
        ...DEFAULT_OPENAI_CONFIG,
        name: "My account",
        model: { ...DEFAULT_OPENAI_CONFIG.model, customModel: "unused" },
      }),
    )
    expect(getOpenAIOutputIdentity(DEFAULT_OPENAI_CONFIG)).not.toBe(
      getOpenAIOutputIdentity({ ...DEFAULT_OPENAI_CONFIG, temperature: 0.4 }),
    )
  })
  it("preserves explicit reasoning over model recommendations", () => {
    const params = buildOpenAIGenerateParams({ ...DEFAULT_OPENAI_CONFIG, reasoning: "low" })
    expect(params.reasoning).toBe("low")
    expect(params.providerOptions).toBeUndefined()
  })
})
