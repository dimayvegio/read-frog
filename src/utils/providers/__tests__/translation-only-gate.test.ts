import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import {
  getTranslationOnlyBlockedReason,
  providerSupportsTranslationOnlyMode,
} from "../translation-only-gate"
describe("OpenAI HTML support", () => {
  it("allows both page modes", () => {
    expect(providerSupportsTranslationOnlyMode("openai")).toBe(true)
    expect(providerSupportsTranslationOnlyMode("microsoft-translate")).toBe(false)
    expect(getTranslationOnlyBlockedReason(DEFAULT_CONFIG)).toBeNull()
  })
})
