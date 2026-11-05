import { describe, expect, it } from "vitest"
import { getRecommendedProviderOptions } from "../../providers/options"
import { LLM_PROVIDER_MODELS } from "../models"
describe("OpenAI model catalog", () => {
  it("contains only the retained local catalog", () => {
    expect(Object.keys(LLM_PROVIDER_MODELS)).toEqual(["openai"])
    expect(LLM_PROVIDER_MODELS.openai).toContain("gpt-4o-mini")
  })
  it.each([
    ["o3-mini", "minimal"],
    ["gpt-5-pro", "high"],
    ["gpt-6-luna", "medium"],
    ["gpt-6.1-sol", "low"],
  ])("recommends reasoning for %s", (model, reasoning) => {
    expect(getRecommendedProviderOptions(model)).toMatchObject({ reasoningEffort: reasoning })
  })
  it("leaves an unknown custom model to OpenAI defaults", () => {
    expect(getRecommendedProviderOptions("my-future-model")).toBeUndefined()
  })
})
