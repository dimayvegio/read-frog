import { describe, expect, it } from "vitest"
import { configSchema } from "@/types/config/config"
import { migrate as upgradeLanguages } from "@/utils/config/migration-scripts/v124-to-v125"
import { migrate } from "../../migration-scripts/v121-to-v122"
import { toPortableConfig } from "../../portable"
import { testSeries } from "../example/v121"

describe("v122 OpenAI TTS migration", () => {
  it("preserves Microsoft voices and controls, is pure and idempotent", () => {
    const old = structuredClone(Object.values(testSeries)[0]!.config)
    const before = structuredClone(old)
    const next = migrate(old)
    expect(old).toEqual(before)
    expect(next.tts).toMatchObject(before.tts)
    expect(next.tts.provider).toBe("microsoft")
    expect(next.tts.openai).toEqual({
      model: "gpt-realtime-2.1-mini",
      voice: "marin",
      speed: 1,
      instructions: "",
    })
    expect(configSchema.safeParse(next).success).toBe(true)
    expect(migrate(next)).toEqual(next)
  })
  it("retains an explicit OpenAI choice across import/export and never imports a TTS credential", () => {
    const raw = migrate(structuredClone(Object.values(testSeries)[0]!.config))
    raw.tts.provider = "openai"
    raw.tts.openai = {
      model: "gpt-4o-mini-tts",
      voice: "coral",
      speed: 1.25,
      instructions: "Speak warmly.",
    }
    expect(toPortableConfig(JSON.parse(JSON.stringify(raw))).tts).toEqual(
      upgradeLanguages({ tts: raw.tts }).tts,
    )
    expect(() =>
      toPortableConfig({
        ...raw,
        tts: { ...raw.tts, openai: { ...raw.tts.openai, apiKey: "private-sentinel" } },
      }),
    ).toThrow(/unrecognized/i)
  })
})
