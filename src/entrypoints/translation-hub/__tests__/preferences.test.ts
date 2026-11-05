// @vitest-environment jsdom
import { createStore } from "jotai"
import { describe, expect, it } from "vitest"
import { configAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { selectedProviderIdsAtom, sourceLangCodeAtom, targetLangCodeAtom } from "../atoms"
describe("Translation Hub preferences", () => {
  it("uses the singleton OpenAI profile and restores saved languages", () => {
    const store = createStore()
    const config = structuredClone(DEFAULT_CONFIG)
    config.translationHub.sourceCode = "jpn"
    config.translationHub.targetCode = "eng"
    store.set(configAtom, config)
    expect(store.get(selectedProviderIdsAtom)).toEqual(["openai-default"])
    expect(store.get(sourceLangCodeAtom)).toBe("jpn")
    expect(store.get(targetLangCodeAtom)).toBe("eng")
  })
})
