import type { OpenAIPublicConfig } from "@/types/config/openai"
import type { UsageTask } from "@/utils/usage/schema"
import { openAIPublicConfigSchema } from "@/types/config/openai"
import {
  featureModelsRecordSchema,
  featureModelSettingSchema,
  OPENAI_FEATURE_MODELS_STORAGE_KEY,
  type FeatureModelKey,
  type FeatureModelSetting,
  type FeatureModelsRecord,
} from "@/types/feature-models"
import { storageAdapter } from "@/utils/atoms/storage-adapter"

// Each document owns immutable preferences until reload. Background execution
// must use the caller's captured model, matching its cache identity exactly.
let snapshot: FeatureModelsRecord = {}
let loading: Promise<FeatureModelsRecord> | undefined
export function loadFeatureModels(): Promise<FeatureModelsRecord> {
  loading ??= storageAdapter
    .get(OPENAI_FEATURE_MODELS_STORAGE_KEY, {}, featureModelsRecordSchema)
    .then((value) => {
      snapshot = value
      return value
    })
    .catch(() => {
      loading = undefined
      throw new Error("Không đọc được cấu hình model; hãy tải lại tab.")
    })
  return loading
}
export async function getFeatureModel(key: FeatureModelKey) {
  if (typeof document === "undefined") {
    const current = await storageAdapter.get(
      OPENAI_FEATURE_MODELS_STORAGE_KEY,
      {},
      featureModelsRecordSchema,
    )
    return current[key] ?? null
  }
  await loadFeatureModels()
  return getFeatureModelSync(key)
}
export function getFeatureModelSync(key: FeatureModelKey): FeatureModelSetting | null {
  const value = snapshot[key]
  return value &&
    (value.model !== "default" || value.temperature !== undefined || value.reasoning !== undefined)
    ? value
    : null
}
export function taskToFeatureKey(task?: UsageTask): FeatureModelKey | null {
  switch (task) {
    case "page":
    case "pdf":
      return "webTranslate"
    case "selection":
      return "selectionTranslate"
    case "image":
    case "ocr":
      return "imageTranslate"
    case "summary":
    case "customAction":
    case "vocabulary":
      return "aiExplanation"
    case "subtitles":
    case "segmentation":
      return "videoSubtitles"
    default:
      return null
  }
}
export function applyFeatureModelOverride(
  base: OpenAIPublicConfig,
  setting: FeatureModelSetting | null,
): OpenAIPublicConfig {
  if (!setting) return base
  const value = featureModelSettingSchema.parse(setting)
  const id = value.isCustomModel ? value.customModel : value.model
  const predefined = openAIPublicConfigSchema.shape.model.shape.model.safeParse(id)
  const model =
    value.model === "default"
      ? base.model
      : predefined.success
        ? { model: predefined.data, isCustomModel: false, customModel: null }
        : { model: base.model.model, isCustomModel: true, customModel: id }
  return openAIPublicConfigSchema.parse({
    ...base,
    model,
    temperature: value.temperature ?? base.temperature,
    reasoning: value.reasoning ?? base.reasoning,
  })
}
