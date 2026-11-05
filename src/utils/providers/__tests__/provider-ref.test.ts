import { describe, expect, it } from "vitest"
import { DEFAULT_OPENAI_CONFIG } from "@/types/config/openai"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import {
  getProviderCacheIdentity,
  resolvePageTranslationProvider,
  serializeProviderRef,
} from "../provider-ref"
describe("public provider snapshots", () => {
  it("serializes a detached validated snapshot", async () => {
    const resolved = resolvePageTranslationProvider(DEFAULT_CONFIG)
    const ref = await serializeProviderRef(resolved)
    resolved.config.name = "changed"
    expect(ref.config.name).toBe("OpenAI")
    expect(ref.kind).toBe("local")
  })
  it("keys output by model and effective params, independently of the label", () => {
    const base = { kind: "local" as const, config: DEFAULT_OPENAI_CONFIG }
    expect(getProviderCacheIdentity(base)).toBe(
      getProviderCacheIdentity({ ...base, config: { ...base.config, name: "Other" } }),
    )
    expect(getProviderCacheIdentity(base)).not.toBe(
      getProviderCacheIdentity({ ...base, config: { ...base.config, temperature: 0.4 } }),
    )
  })
})
