import { imageEditModel } from "@/utils/image-translation/generated-schema"
import { LLM_PROVIDER_MODELS } from "./models"
export const OPENAI_IMAGE_EDIT_MODELS = imageEditModel.options
export const MODEL_DESCRIPTIONS: Record<string, string> = {}
// Presence in /models does not prove endpoint compatibility. Offer tested IDs;
// other text IDs require an explicit custom choice, never automatic selection.
export function getCatalogModels(
  modelType: "text" | "image" | "audio",
  _liveModels: string[] = [],
): string[] {
  if (modelType === "image") return [...OPENAI_IMAGE_EDIT_MODELS]
  if (modelType === "audio") return []
  return [...LLM_PROVIDER_MODELS.openai]
}
