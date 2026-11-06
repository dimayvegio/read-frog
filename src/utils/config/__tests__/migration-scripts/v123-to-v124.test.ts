import { describe, expect, it } from "vitest"
import { configSchema } from "@/types/config/config"
import { migrateConfig } from "../../migration"
import { migrate } from "../../migration-scripts/v123-to-v124"
import { toPortableConfig } from "../../portable"
import { testSeries } from "../example/v123"

describe("v124 opt-in ani.pm subtitles", () => {
  it("adds only the new false choice, preserves installed settings, and is idempotent", async () => {
    const old = structuredClone(Object.values(testSeries)[0]!.config)
    old.videoSubtitles.autoStart.youtube = true
    const before = structuredClone(old)
    const next = migrate(old)
    expect(old).toEqual(before)
    expect(next).toEqual({
      ...before,
      videoSubtitles: {
        ...before.videoSubtitles,
        autoStart: { ...before.videoSubtitles.autoStart, anipm: false },
      },
    })
    expect(configSchema.safeParse(next).success).toBe(true)
    expect(migrate(next)).toEqual(next)
    expect(await migrateConfig(old, 123)).toEqual(toPortableConfig(next))
  })

  it("retains ani.pm preferences through portable import/export without copying credentials", () => {
    const next = migrate(structuredClone(Object.values(testSeries)[0]!.config))
    next.videoSubtitles.autoStart.anipm = true
    next.providersConfig[0].apiKey = "private-test-key"
    const portable = toPortableConfig(next)
    expect(portable.videoSubtitles.autoStart.anipm).toBe(true)
    expect(JSON.stringify(portable)).not.toContain("private-test-key")
    expect(toPortableConfig(portable)).toEqual(portable)
  })
})
