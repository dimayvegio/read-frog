import type { BackgroundTextStreamSnapshot } from "@/types/background-stream"
import type { Config } from "@/types/config/config"
import type { ImagePretranslation } from "@/types/image-translation"
import { MAX_NATIVE_SELECTION_LENGTH } from "@/types/native-selection"
import { streamBackgroundText } from "@/utils/content-script/background-stream-client"
import { createGlossaryMatcher } from "@/utils/glossary/matcher"
import { prepareTranslationText } from "@/utils/host/translate/text-preparation"
import { imageCacheKey, readImageCache, saveImageCache } from "@/utils/image-translation/cache"
import { imageTranslationContext } from "@/utils/image-translation/context"
import { sendMessage } from "@/utils/message"
import { getNativeTranslatePrompt } from "@/utils/prompts/native-translate"
import { getOpenAIOutputIdentity } from "@/utils/providers/openai-profile"
import { resolveProviderRefForCapability } from "@/utils/providers/provider-registry"
import { ProviderSetupError } from "@/utils/providers/provider-setup-error"
import {
  getPdfHistoryEpoch,
  pdfCacheKey,
  readPdfCache,
  savePdfHistory,
  type PdfDocument,
} from "./pdf-history"
import { preparePdfText, DEFAULT_PDF_TEXT_OPTIONS, type PdfTextOptions } from "./pdf-text"

export async function translateNativeSelection({
  text,
  config,
  signal,
  onChunk,
  document,
  textOptions = DEFAULT_PDF_TEXT_OPTIONS,
  bypassCache = false,
  onCacheState,
  imageCache = false,
  pretranslated,
}: {
  text: string
  config: Config
  signal: AbortSignal
  onChunk: (chunk: BackgroundTextStreamSnapshot) => void
  document?: PdfDocument
  textOptions?: PdfTextOptions
  bypassCache?: boolean
  onCacheState?: (state: "cached" | "saved" | "not-saved", message?: string) => void
  imageCache?: boolean
  pretranslated?: ImagePretranslation
}) {
  const preparedText = prepareTranslationText(preparePdfText(text, textOptions))
  if (
    !preparedText ||
    text.length > MAX_NATIVE_SELECTION_LENGTH ||
    preparedText.length > MAX_NATIVE_SELECTION_LENGTH
  ) {
    throw new Error("Invalid selection length")
  }
  signal.throwIfAborted()
  if (pretranslated && !bypassCache && pretranslated.original === text) {
    const context = await imageTranslationContext(config, textOptions)
    signal.throwIfAborted()
    if (!context.reason && context.identity === pretranslated.identity) {
      const snapshot = {
        output: pretranslated.output,
        thinking: { status: "complete", text: "" },
      } as const
      onChunk(snapshot)
      onCacheState?.("cached", "Dùng kết quả một lượt từ ảnh; không gọi dịch thêm.")
      return snapshot
    }
  }
  const provider = resolveProviderRefForCapability(
    "selectionTranslation",
    config.providersConfig,
    config.selectionToolbar.features.translate.providerId,
  )
  if (!provider) throw new ProviderSetupError("Configure OpenAI in settings")
  // PDF selections have no website context. Apply only global glossaries,
  // never a glossary scoped to the extension's own origin or a local file path.
  const glossary = config.glossary.enabled
    ? await sendMessage("getGlossarySnapshot", {
        url: undefined,
        targetLang: config.language.targetCode,
      })
    : null
  signal.throwIfAborted()
  const glossaryTerms = glossary ? createGlossaryMatcher(glossary.entries).match(preparedText) : []
  const { systemPrompt, prompt } = getNativeTranslatePrompt(config, preparedText, { glossaryTerms })
  const payload = {
    providerKind: "local",
    providerId: provider.config.id,
    providerConfig: provider.config,
    instructions: systemPrompt,
    prompt,
    usageTask: imageCache ? "image" : document ? "pdf" : "selection",
  } as const
  let cacheId: string | undefined,
    epoch = 0
  let imageTextKey: string | undefined,
    imageEpoch: number | null = null
  if (imageCache) {
    try {
      const status = await sendMessage("getOpenAIKeyStatus", undefined)
      signal.throwIfAborted()
      imageTextKey = imageCacheKey(
        "text",
        "explicit-target-v1",
        config.language.targetCode,
        payload.instructions,
        payload.prompt,
        getOpenAIOutputIdentity(provider.config),
        status.revision,
        [textOptions.clean, textOptions.joinHyphenatedWords],
      )
      const cached = await readImageCache(imageTextKey)
      imageEpoch = cached.epoch
      signal.throwIfAborted()
      if (!bypassCache && cached.value?.translation) {
        void sendMessage("recordLocalCacheHit", { task: "image" }).catch(() => {})
        const snapshot = {
          output: cached.value.translation,
          thinking: { status: "complete", text: "" },
        } as const
        onChunk(snapshot)
        onCacheState?.("cached", "Dùng bản dịch ảnh lưu trên máy — không gọi API.")
        return snapshot
      }
    } catch {
      signal.throwIfAborted()
      imageTextKey = undefined
    }
  }
  if (document) {
    try {
      const status = await sendMessage("getOpenAIKeyStatus", undefined)
      signal.throwIfAborted()
      cacheId = pdfCacheKey(document.id, [
        "explicit-target-v1",
        config.language.targetCode,
        payload.instructions,
        payload.prompt,
        getOpenAIOutputIdentity(provider.config),
        status.revision,
        [textOptions.clean, textOptions.joinHyphenatedWords],
      ])
      epoch = await getPdfHistoryEpoch(document)
      const cached = bypassCache ? null : await readPdfCache(cacheId, document.id)
      signal.throwIfAborted()
      if (cached) {
        void sendMessage("recordLocalCacheHit", { task: "pdf" }).catch(() => {})
        onCacheState?.("cached")
        const snapshot = {
          output: cached.output,
          thinking: { status: "complete", text: "" },
        } as const
        onChunk(snapshot)
        return snapshot
      }
    } catch (error) {
      signal.throwIfAborted()
      cacheId = undefined
      onCacheState?.(
        "not-saved",
        error instanceof Error ? error.message : "Chưa mở được lịch sử PDF.",
      )
    }
  }
  const result = await streamBackgroundText(payload, {
    signal,
    onChunk: (chunk) => {
      if (!signal.aborted) onChunk(chunk)
    },
  })
  signal.throwIfAborted()
  if (imageTextKey && imageEpoch !== null && result.output.trim()) {
    try {
      const saved = await saveImageCache(
        imageTextKey,
        "text",
        { original: text, translation: result.output },
        imageEpoch,
        signal,
      )
      onCacheState?.(
        saved ? "saved" : "not-saved",
        saved
          ? "Đã lưu cache bản dịch ảnh trên máy."
          : "Cache đã được xóa khi đang dịch; kết quả này không lưu lại.",
      )
    } catch {
      signal.throwIfAborted()
      onCacheState?.("not-saved", "Đã dịch nhưng chưa lưu được cache ảnh.")
    }
  }
  if (document && cacheId && result.output.trim()) {
    try {
      const saved = await savePdfHistory(
        document,
        {
          id: cacheId,
          documentId: document.id,
          original: text,
          prepared: preparedText,
          output: result.output,
          targetLanguage: config.language.targetCode,
          model: provider.config.model.model ?? "OpenAI",
          ...textOptions,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        epoch,
        signal,
      )
      signal.throwIfAborted()
      onCacheState?.(
        saved ? "saved" : "not-saved",
        saved ? undefined : "Lịch sử đã được xóa khi đang dịch; kết quả này không được lưu lại.",
      )
    } catch (error) {
      signal.throwIfAborted()
      onCacheState?.(
        "not-saved",
        error instanceof Error ? error.message : "Đã dịch, nhưng chưa lưu được lịch sử.",
      )
    }
  }
  return result
}
