import type { SelectionToolbarTranslateRequestSlice } from "../atoms"
import type { BackgroundTextStreamSnapshot, ThinkingSnapshot } from "@/types/background-stream"
import type { OpenAIPublicConfig } from "@/types/config/openai"
import type { SelectionPromptContext } from "@/utils/prompts/selection-context"
import type { PromptableProviderRef } from "@/utils/providers/provider-ref"
import type { SelectionTranslationProviderRef } from "@/utils/providers/provider-registry"
import { LANG_CODE_TO_EN_NAME } from "@read-frog/definitions"
import { openAIPublicConfigSchema } from "@/types/config/openai"
import { streamBackgroundText } from "@/utils/content-script/background-stream-client"
import { resolveGlossaryTermsFromCache } from "@/utils/glossary/active-matcher"
import { getOrCreateWebPageContext } from "@/utils/host/translate/webpage-context"
import { getOrGenerateWebPageSummary } from "@/utils/host/translate/webpage-summary"
import { getTranslatePromptFromConfig } from "@/utils/prompts/translate"

// The three ways a selection gets translated — hosted Built-in AI, a local
// LLM, a pure translate provider — shared by the translate button and word
// annotation, which shows the same translation between the lines. Either
// caller passes the paragraph(s) the selection sits in, so a word is rendered
// with the sense it has there.

/**
 * Page context for the selection prompt. `summaryProviderRef` is the provider
 * the (cached, smart-context-gated) page summary runs on — hosted and local
 * LLM refs both work; pass null to skip the summary while keeping the raw
 * context (pure translate providers, hosted tier unavailable).
 */
export async function getSelectionWebPagePromptContext(
  summaryProviderRef: PromptableProviderRef | null,
  enableAIContentAware: boolean,
) {
  const webPageContext = await getOrCreateWebPageContext()
  if (!webPageContext) {
    return undefined
  }

  const webSummary = summaryProviderRef
    ? await getOrGenerateWebPageSummary(
        webPageContext,
        summaryProviderRef,
        enableAIContentAware,
        "selectionTranslation",
      )
    : null
  return {
    webTitle: webPageContext.webTitle,
    webDescription: webPageContext.webDescription,
    webContent: webPageContext.webContent,
    webSummary: webSummary ?? undefined,
  }
}

export async function translateWithTextStream({
  preparedText,
  providerId,
  providerConfig,
  translateRequest,
  selectionContext,
  onChunk,
  registerAbortController,
}: {
  preparedText: string
  providerId: string
  providerConfig: OpenAIPublicConfig
  translateRequest: SelectionToolbarTranslateRequestSlice
  /** The paragraph(s) the selection sits in; see utils/prompts/selection-context.ts. */
  selectionContext?: SelectionPromptContext
  onChunk: (data: BackgroundTextStreamSnapshot) => void
  registerAbortController: (abortController: AbortController) => void
}) {
  const targetLangName = LANG_CODE_TO_EN_NAME[translateRequest.language.targetCode]
  const snapshot = openAIPublicConfigSchema.parse(providerConfig)
  if (providerId !== snapshot.id) throw new Error("Provider snapshot mismatch")
  const abortController = new AbortController()
  registerAbortController(abortController)

  const throwIfAborted = () => {
    if (abortController.signal.aborted) {
      throw new DOMException("aborted", "AbortError")
    }
  }

  const webPageContext = await getSelectionWebPagePromptContext(
    { kind: "local", config: providerConfig },
    translateRequest.enableAIContentAware,
  )
  throwIfAborted()

  // Read from the already-compiled matcher — no await on this path. See
  // `resolveGlossaryTermsFromCache`.
  const glossaryTerms = resolveGlossaryTermsFromCache(
    preparedText,
    translateRequest.glossaryEnabled,
    translateRequest.language.targetCode,
  )
  const { systemPrompt, prompt } = getTranslatePromptFromConfig(
    { customPromptsConfig: translateRequest.customPromptsConfig },
    targetLangName,
    preparedText,
    {
      ...(webPageContext
        ? {
            context: {
              webTitle: webPageContext.webTitle,
              webDescription: webPageContext.webDescription,
              webContent: webPageContext.webContent,
              webSummary: webPageContext.webSummary,
            },
          }
        : {}),
      glossaryTerms,
      selectionContext,
    },
  )

  const translatedText = await streamBackgroundText(
    {
      providerKind: "local",
      providerId: snapshot.id,
      providerConfig: snapshot,
      instructions: systemPrompt,
      prompt,
    },
    {
      signal: abortController.signal,
      onChunk,
    },
  )

  return translatedText
}

export function checkSelectionTranslateProvider(
  provider: SelectionTranslationProviderRef | null,
): "providerUnavailable" | "providerDisabled" | null {
  if (!provider) return "providerUnavailable"
  if (!provider.config.enabled) return "providerDisabled"
  return openAIPublicConfigSchema.safeParse(provider.config).success ? null : "providerUnavailable"
}

export async function translateSelection({
  preparedText,
  provider,
  translateRequest,
  selectionContext,
  onChunk,
  registerAbortController,
}: {
  preparedText: string
  provider: SelectionTranslationProviderRef
  translateRequest: SelectionToolbarTranslateRequestSlice
  selectionContext?: SelectionPromptContext
  onChunk?: (data: BackgroundTextStreamSnapshot) => void
  registerAbortController: (controller: AbortController) => void
}): Promise<{ output: string; thinking: ThinkingSnapshot | null }> {
  return translateWithTextStream({
    preparedText,
    providerId: provider.config.id,
    providerConfig: provider.config,
    translateRequest,
    selectionContext,
    onChunk: onChunk ?? (() => {}),
    registerAbortController,
  })
}
