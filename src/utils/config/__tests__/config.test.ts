import type { VersionTestData } from "./example/types"
import { describe, expect, it } from "vitest"
import { configSchema } from "@/types/config/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { migrateConfig, LATEST_SCHEMA_VERSION } from "../migration"
import { toPortableConfig } from "../portable"

describe("portable configuration", () => {
  for (let version = 1; version <= LATEST_SCHEMA_VERSION; version++) {
    it("projects every real fixture in schema version " + version, async () => {
      const fixture = (await import(
        "./example/v" + String(version).padStart(3, "0") + ".ts"
      )) as VersionTestData
      expect(fixture.testSeries).toBeDefined()
      expect(Object.keys(fixture.testSeries).length).toBeGreaterThan(0)
      for (const entry of Object.values(fixture.testSeries)) {
        expect(entry.config).toBeDefined()
        const raw = structuredClone(entry.config)
        const result = await migrateConfig(raw, version)
        expect(configSchema.safeParse(result).success).toBe(true)
        expect(result.providersConfig).toHaveLength(1)
        expect(result.providersConfig[0]).not.toHaveProperty("apiKey")
        expect(result.providersConfig[0]).not.toHaveProperty("baseURL")
        expect(result.selectionToolbar).not.toHaveProperty("noteSuggestion")
        // Historical steps may mutate their private input; v121 purity is tested separately.
      }
    })
  }
  it("projects even a same-version document and preserves local text, layout, glossary and TTS", async () => {
    const raw = structuredClone(DEFAULT_CONFIG)
    const dirty = {
      ...raw,
      auth: { token: "root-sentinel" },
      providersConfig: [
        {
          ...raw.providersConfig[0],
          apiKey: "key-sentinel",
          baseURL: "https://proxy.invalid/v1",
          headers: { Authorization: "header-sentinel" },
          providerOptions: { token: "option-sentinel" },
        },
      ],
    }
    const result = await migrateConfig(dirty, LATEST_SCHEMA_VERSION)
    for (const secret of [
      "root-sentinel",
      "key-sentinel",
      "header-sentinel",
      "option-sentinel",
      "proxy.invalid",
    ])
      expect(JSON.stringify(result)).not.toContain(secret)
    expect(result.tts).toEqual(raw.tts)
    expect(result.glossary).toEqual(raw.glossary)
    expect(result.pageTranslation.customPromptsConfig).toEqual(
      raw.pageTranslation.customPromptsConfig,
    )
    expect(toPortableConfig(result)).toEqual(result)
  })
  it("rejects future and malformed versions", async () => {
    await expect(migrateConfig(DEFAULT_CONFIG, LATEST_SCHEMA_VERSION + 1)).rejects.toThrow(
      "options.configMigration.versionTooNew",
    )
    await expect(migrateConfig(DEFAULT_CONFIG, 0)).rejects.toThrow(
      "Invalid configuration schema version",
    )
    expect(() => toPortableConfig({})).toThrow("Missing legacy providers")
  })
})
