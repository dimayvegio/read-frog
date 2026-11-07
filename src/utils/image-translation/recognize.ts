import type { Config } from "@/types/config/config"
import type { PdfTextOptions } from "@/utils/selection-result/pdf-text"
import { sha256 } from "js-sha256"
import {
  imageDataURLSchema,
  imagePairSchema,
  type ImagePretranslation,
} from "@/types/image-translation"
import {
  streamBackgroundImageText,
  streamBackgroundImageTranslation,
} from "@/utils/content-script/background-stream-client"
import { imageCacheKey, readImageCache, saveImageCache } from "./cache"
import { imageTranslationContext, OCR_INSTRUCTIONS } from "./context"
export async function recognizeImage({
  image,
  mode,
  config,
  options,
  signal,
  bypass = false,
  onStatus,
  onChunk,
}: {
  image: string
  mode: "fast" | "two-step"
  config: Config
  options: PdfTextOptions
  signal: AbortSignal
  bypass?: boolean
  onStatus: (text: string) => void
  onChunk: (original: string, translation: string) => void
}): Promise<{ original: string; pretranslated?: ImagePretranslation }> {
  imageDataURLSchema.parse(image)
  const context = await imageTranslationContext(config, options)
  signal.throwIfAborted()
  const fast = mode === "fast" && !context.reason
  const key = fast
    ? imageCacheKey("fast", sha256(image), context.identity)
    : imageCacheKey("ocr", sha256(image), OCR_INSTRUCTIONS, context.profile, context.revision)
  let epoch: number | null
  try {
    const cached = await readImageCache(key)
    epoch = cached.epoch
    signal.throwIfAborted()
    if (!bypass && cached.value) {
      onChunk(cached.value.original, fast ? (cached.value.translation ?? "") : "")
      onStatus(
        fast
          ? "Dùng bản lưu chữ và bản dịch — không gọi API."
          : "Dùng chữ đã nhận dạng trên máy; không đọc ảnh lại.",
      )
      return {
        original: cached.value.original,
        ...(fast && cached.value.translation
          ? {
              pretranslated: {
                original: cached.value.original,
                output: cached.value.translation,
                identity: context.identity,
              },
            }
          : {}),
      }
    }
  } catch {
    signal.throwIfAborted()
    epoch = null
  }
  onStatus(
    fast
      ? "Đang đọc chữ và dịch trong một lượt…"
      : context.reason || "Đang đọc chữ trong vùng đã chọn…",
  )
  const common = {
    providerKind: "local",
    providerId: context.provider.config.id,
    providerConfig: context.provider.config,
    image,
  } as const
  const originalResult = fast
    ? null
    : await streamBackgroundImageText(
        {
          ...common,
          instructions: OCR_INSTRUCTIONS,
          prompt: "Read the text in this selected image region.",
          maxOutputTokens: 16000,
        },
        {
          signal,
          onChunk: (chunk) => {
            if (!signal.aborted) onChunk(chunk.output, "")
          },
        },
      )
  const pairResult = fast
    ? await streamBackgroundImageTranslation(
        {
          ...common,
          instructions: context.fastInstructions,
          prompt: context.prompt.prompt,
          maxOutputTokens: 16000,
        },
        {
          signal,
          onChunk: (chunk) => {
            if (signal.aborted) return
            const original = typeof chunk.output.original === "string" ? chunk.output.original : "",
              translation =
                typeof chunk.output.translation === "string" ? chunk.output.translation : ""
            onChunk(original, translation)
          },
        },
      )
    : null
  signal.throwIfAborted()
  const pair = pairResult
    ? imagePairSchema.parse(pairResult.output)
    : { original: originalResult!.output, translation: "" }
  const original = pair.original.trim(),
    translation = pair.translation.trim()
  if (!original) throw new Error("Không đọc được chữ trong vùng này. Hãy chọn vùng rõ hơn.")
  if (original.length > 20000 || translation.length > 60000 || (fast && !translation))
    throw new Error("Kết quả thiếu hoặc quá dài. Hãy chọn vùng nhỏ hơn.")
  if (epoch !== null) {
    try {
      await saveImageCache(
        key,
        fast ? "fast" : "ocr",
        { original, ...(translation ? { translation } : {}) },
        epoch,
        signal,
      )
    } catch {
      signal.throwIfAborted()
      onStatus("Đã nhận dạng nhưng chưa lưu được cache trên máy.")
    }
  }
  onStatus(
    fast
      ? "Đã đọc chữ và dịch trong một lượt. Có thể sửa chữ và dịch lại."
      : context.reason
        ? `${context.reason} Đã nhận dạng xong.`
        : "Đã đọc chữ. Bạn có thể sửa chữ và dịch lại nếu cần.",
  )
  return {
    original,
    ...(fast
      ? { pretranslated: { original, output: translation, identity: context.identity } }
      : {}),
  }
}
