import { createStore } from "jotai"
import { describe, expect, it } from "vitest"
import { DEFAULT_OPENAI_CONFIG } from "@/types/config/openai"
import { featureProviderRefAtom, updateLLMProviderConfig, updateProviderConfig } from "../provider"
describe("public provider updates", () => {
  it("merges model fields while retaining the built-in model", () => {
    expect(
      updateLLMProviderConfig(DEFAULT_OPENAI_CONFIG, {
        model: { isCustomModel: true, customModel: "custom-id" },
      }).model,
    ).toEqual({ ...DEFAULT_OPENAI_CONFIG.model, isCustomModel: true, customModel: "custom-id" })
  })
  it("rejects secret and endpoint overrides", () => {
    for (const changes of [
      { apiKey: "sentinel" },
      { baseURL: "https://proxy.invalid" },
      { headers: { Authorization: "sentinel" } },
      { providerOptions: { x: true } },
    ])
      expect(() =>
        updateProviderConfig(DEFAULT_OPENAI_CONFIG, { ...DEFAULT_OPENAI_CONFIG, ...changes }),
      ).toThrow("Unrecognized key")
  })
  it("resolves the canonical local snapshot", () => {
    expect(createStore().get(featureProviderRefAtom("pageTranslation"))).toMatchObject({
      kind: "local",
      id: "openai-default",
      config: DEFAULT_OPENAI_CONFIG,
    })
  })
})
