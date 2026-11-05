import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { configSchema } from "../config"
describe("canonical provider invariants", () => {
  it("requires exactly one enabled OpenAI row", () => {
    for (const rows of [
      [],
      [...DEFAULT_CONFIG.providersConfig, ...DEFAULT_CONFIG.providersConfig],
      [{ ...DEFAULT_CONFIG.providersConfig[0], enabled: false }],
    ])
      expect(configSchema.safeParse({ ...DEFAULT_CONFIG, providersConfig: rows }).success).toBe(
        false,
      )
  })
  it("keeps Translation Hub on its single OpenAI profile", () => {
    expect(configSchema.parse(DEFAULT_CONFIG).translationHub.selectedProviderIds).toEqual([
      "openai-default",
    ])
    expect(
      configSchema.safeParse({
        ...DEFAULT_CONFIG,
        translationHub: { ...DEFAULT_CONFIG.translationHub, selectedProviderIds: [] },
      }).success,
    ).toBe(false)
  })
})
