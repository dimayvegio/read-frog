import { describe, expect, it } from "vitest"
import { DEFAULT_OPENAI_CONFIG } from "@/types/config/openai"
import { migrate as upgradeLanguages } from "@/utils/config/migration-scripts/v124-to-v125"
import { migrate } from "../../migration-scripts/v120-to-v121"
import { toPortableConfig } from "../../portable"
import { testSeries } from "../example/v120"

describe("v121 public projection", () => {
  it("projects every real v120 fixture and retains TTS, actions, prompts and glossary settings", () => {
    expect(Object.keys(testSeries).length).toBeGreaterThan(0)
    for (const fixture of Object.values(testSeries)) {
      expect(fixture.config).toBeDefined()
      const old = structuredClone(fixture.config)
      old.tts.defaultVoice = "custom-voice"
      old.tts.rate = 23
      old.selectionToolbar.features.speak = { enabled: false, shortcut: "" }
      old.selectionToolbar.unpinned.push("speak")
      old.providersConfig.forEach((row: Record<string, unknown>) => {
        row.apiKey = "migration-only-sentinel"
        row.headers = { Authorization: "header-only-sentinel" }
      })
      const result = toPortableConfig(migrate(old))
      const serialized = JSON.stringify(result)
      expect(serialized).not.toContain("migration-only-sentinel")
      expect(serialized).not.toContain("header-only-sentinel")
      expect(serialized).not.toContain("notebaseConnection")
      expect(result.providersConfig).toHaveLength(1)
      expect(result.providersConfig[0]?.provider).toBe("openai")
      expect(migrate(old).tts).toEqual(old.tts)
      expect(result.tts).toMatchObject(upgradeLanguages({ tts: old.tts }).tts)
      expect(result.selectionToolbar.features.speak).toEqual({ enabled: false, shortcut: "" })
      expect(result.selectionToolbar.unpinned).toContain("speak")
      expect(result.selectionToolbar).not.toHaveProperty("noteSuggestion")
      expect(result.pageTranslation.customPromptsConfig).toEqual(
        old.pageTranslation.customPromptsConfig,
      )
      expect(result.glossary).toEqual(old.glossary)
    }
  })
  it("uses the selected official model, defaults on ambiguity, and never activates a proxy model", () => {
    const old = structuredClone(Object.values(testSeries)[0]!.config)
    const a = { ...DEFAULT_OPENAI_CONFIG, id: "a", temperature: 0.3, reasoning: "low" }
    const b = {
      ...DEFAULT_OPENAI_CONFIG,
      id: "b",
      model: { ...DEFAULT_OPENAI_CONFIG.model, model: "gpt-4o-mini" },
    }
    old.providersConfig = [a, b]
    old.pageTranslation.providerId = "b"
    expect(toPortableConfig(old).providersConfig[0]?.model.model).toBe("gpt-4o-mini")
    old.pageTranslation.providerId = "unknown"
    expect(toPortableConfig(old).providersConfig).toEqual([DEFAULT_OPENAI_CONFIG])
    old.providersConfig = [
      {
        ...b,
        model: {
          model: "retired-built-in-id",
          isCustomModel: true,
          customModel: "my-valid-custom-id",
        },
      },
    ]
    expect(toPortableConfig(old).providersConfig[0]?.model).toEqual({
      model: "gpt-6-luna",
      isCustomModel: true,
      customModel: "my-valid-custom-id",
    })
    old.providersConfig = [{ ...b, baseURL: "https://proxy.example/v1" }]
    expect(toPortableConfig(old).providersConfig).toEqual([DEFAULT_OPENAI_CONFIG])
  })
})
