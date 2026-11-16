import type { FeatureModelSetting } from "@/types/feature-models"
import { describe, expect, it } from "vitest"
import { DEFAULT_OPENAI_CONFIG } from "@/types/config/openai"
import { featureModelsRecordSchema, featureModelSettingSchema } from "@/types/feature-models"
import { getCatalogModels } from "@/utils/constants/openai-catalog"
import { getOpenAIOutputIdentity } from "@/utils/providers/openai-profile"
import { applyFeatureModelOverride, taskToFeatureKey } from "../resolver"

describe("feature model resolver", () => {
  it("maps usage tasks correctly to feature keys", () => {
    expect(taskToFeatureKey("page")).toBe("webTranslate")
    expect(taskToFeatureKey("pdf")).toBe("webTranslate")
    expect(taskToFeatureKey("selection")).toBe("selectionTranslate")
    expect(taskToFeatureKey("image")).toBe("imageTranslate")
    expect(taskToFeatureKey("ocr")).toBe("imageTranslate")
    expect(taskToFeatureKey("summary")).toBe("aiExplanation")
    expect(taskToFeatureKey("customAction")).toBe("aiExplanation")
    expect(taskToFeatureKey("vocabulary")).toBe("aiExplanation")
    expect(taskToFeatureKey("subtitles")).toBe("videoSubtitles")
    expect(taskToFeatureKey("segmentation")).toBe("videoSubtitles")
    expect(taskToFeatureKey("connection")).toBeNull()
    expect(taskToFeatureKey("other")).toBeNull()
    expect(taskToFeatureKey(undefined)).toBeNull()
  })

  it("applies model override when configured", () => {
    const setting: FeatureModelSetting = {
      model: "gpt-4o",
      isCustomModel: false,
      temperature: 0.2,
      reasoning: "low",
    }
    const result = applyFeatureModelOverride(DEFAULT_OPENAI_CONFIG, setting)
    expect(result.model.model).toBe("gpt-4o")
    expect(result.model.isCustomModel).toBe(false)
    expect(result.temperature).toBe(0.2)
    expect(result.reasoning).toBe("low")
  })

  it("applies custom model override", () => {
    const setting: FeatureModelSetting = {
      model: "custom",
      isCustomModel: true,
      customModel: "ft:gpt-4o-mini:my-org:custom-tag",
    }
    const result = applyFeatureModelOverride(DEFAULT_OPENAI_CONFIG, setting)
    expect(result.model.isCustomModel).toBe(true)
    expect(result.model.customModel).toBe("ft:gpt-4o-mini:my-org:custom-tag")
  })

  it("falls back to base config when setting is default or null", () => {
    const defaultSetting: FeatureModelSetting = {
      model: "default",
    }
    const resultDefault = applyFeatureModelOverride(DEFAULT_OPENAI_CONFIG, defaultSetting)
    expect(resultDefault).toEqual(DEFAULT_OPENAI_CONFIG)

    const resultNull = applyFeatureModelOverride(DEFAULT_OPENAI_CONFIG, null)
    expect(resultNull).toEqual(DEFAULT_OPENAI_CONFIG)
  })
})

it("keeps unknown explicit text IDs inside the validated custom-model field", () => {
  const result = applyFeatureModelOverride(DEFAULT_OPENAI_CONFIG, { model: "gpt-new-text" })
  expect(result.model.isCustomModel).toBe(true)
  expect(result.model.customModel).toBe("gpt-new-text")
  expect(getOpenAIOutputIdentity(result)).not.toBe(getOpenAIOutputIdentity(DEFAULT_OPENAI_CONFIG))
})
it("applies advanced settings with the shared default model and leaves the base immutable", () => {
  const result = applyFeatureModelOverride(DEFAULT_OPENAI_CONFIG, {
    model: "default",
    temperature: 0.2,
  })
  expect(result.model).toEqual(DEFAULT_OPENAI_CONFIG.model)
  expect(result.temperature).toBe(0.2)
  expect(DEFAULT_OPENAI_CONFIG.temperature).toBeUndefined()
})
it.each(["", "a".repeat(129), "https://evil.example/model", "gpt-model\nsecret"])(
  "rejects invalid or oversized IDs: %s",
  (id) => {
    expect(featureModelSettingSchema.safeParse({ model: id }).success).toBe(false)
  },
)
it("rejects empty custom drafts and unknown feature keys", () => {
  expect(
    featureModelSettingSchema.safeParse({ model: "custom", isCustomModel: true, customModel: "" })
      .success,
  ).toBe(false)
  expect(featureModelsRecordSchema.safeParse({ unknownFeature: { model: "gpt-4o" } }).success).toBe(
    false,
  )
})
it("never adds unverified image/audio/embedding IDs to endpoint catalogs", () => {
  const live = [
    "gpt-audio-1.5",
    "gpt-live-transcribe",
    "whisper-1",
    "gpt-image-unverified",
    "text-embedding-ada-002",
  ]
  expect(getCatalogModels("audio", live)).toEqual([])
  expect(getCatalogModels("image", live)).not.toContain("gpt-image-unverified")
  for (const id of live) expect(getCatalogModels("text", live)).not.toContain(id)
})
