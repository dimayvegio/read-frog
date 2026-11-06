import { describe, expect, it } from "vitest"
import { configSchema } from "@/types/config/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { migrateConfig } from "../../migration"
import { migrate } from "../../migration-scripts/v122-to-v123"
import { toPortableConfig } from "../../portable"
import { testSeries } from "../example/v122"

describe("v123 upstream caption platforms in the local fork", () => {
  it("upgrades a real v122 snapshot without mutating it or changing its existing settings", async () => {
    const old = structuredClone(Object.values(testSeries)[0]!.config)
    old.videoSubtitles.autoStart.youtube = true
    old.tts.provider = "openai"
    old.tts.openai = {
      model: "gpt-4o-mini-tts",
      voice: "coral",
      speed: 1.25,
      instructions: "Warm.",
    }
    const before = structuredClone(old)
    const next = migrate(old)
    expect(old).toEqual(before)
    expect(next).toEqual({
      ...before,
      videoSubtitles: {
        ...before.videoSubtitles,
        autoStart: {
          ...before.videoSubtitles.autoStart,
          bilibili: false,
          udemy: false,
          edx: false,
        },
      },
    })
    expect(configSchema.safeParse(next).success).toBe(true)
    expect(await migrateConfig(old, 122)).toEqual(toPortableConfig(next))
    expect(migrate(next)).toEqual(next)
  })

  it("retains explicit site choices on reimport and never brings back a provider credential or endpoint", () => {
    const old = structuredClone(DEFAULT_CONFIG)
    old.videoSubtitles.autoStart.bilibili = true
    old.videoSubtitles.autoStart.edx = true
    const imported = toPortableConfig({
      ...old,
      providersConfig: [
        {
          ...old.providersConfig[0],
          apiKey: "upgrade-private-sentinel",
          baseURL: "https://proxy.invalid",
        },
      ],
      auth: { token: "removed-auth-sentinel" },
    })
    expect(imported.videoSubtitles.autoStart).toEqual(old.videoSubtitles.autoStart)
    expect(imported.tts).toEqual(old.tts)
    expect(imported.providersConfig).toHaveLength(1)
    expect(JSON.stringify(imported)).not.toMatch(
      /upgrade-private-sentinel|proxy\.invalid|removed-auth-sentinel/,
    )
  })
})
