import { describe, expect, it } from "vitest"
import { openAIProvidersConfigSchema } from "@/types/config/openai"
import {
  buildDefaultProviderConfigList,
  DEFAULT_PROVIDER_CONFIG_LIST,
  PROVIDER_ITEMS,
} from "../providers"
describe("local provider catalog", () => {
  it("contains exactly the canonical OpenAI profile and a packaged logo", () => {
    expect(openAIProvidersConfigSchema.parse(DEFAULT_PROVIDER_CONFIG_LIST)).toHaveLength(1)
    expect(Object.keys(PROVIDER_ITEMS)).toEqual(["openai"])
    expect(PROVIDER_ITEMS.openai.logo()).not.toMatch(/^https?:/)
  })
  it("returns independent default objects", () => {
    const first = buildDefaultProviderConfigList()
    first[0]!.name = "Changed"
    expect(buildDefaultProviderConfigList()[0]!.name).toBe("OpenAI")
  })
})
