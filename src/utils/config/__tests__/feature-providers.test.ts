import { describe, expect, it } from "vitest"
import { configSchema } from "@/types/config/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { FEATURE_KEYS, FEATURE_PROVIDER_DEFS } from "@/utils/constants/feature-providers"
describe("retained feature providers", () => {
  it("references OpenAI for every text feature", () => {
    for (const key of FEATURE_KEYS)
      expect(FEATURE_PROVIDER_DEFS[key].getProviderId(DEFAULT_CONFIG)).toBe("openai-default")
    expect(FEATURE_KEYS).not.toContain("noteSuggestion")
  })
  it("rejects a stale provider assignment", () => {
    const config = structuredClone(DEFAULT_CONFIG)
    config.pageTranslation.providerId = "removed-provider"
    expect(configSchema.safeParse(config).success).toBe(false)
  })
})
