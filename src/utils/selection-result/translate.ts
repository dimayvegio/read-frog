import type { BackgroundTextStreamSnapshot } from "@/types/background-stream"
import type { Config } from "@/types/config/config"
import { LANG_CODE_TO_EN_NAME } from "@read-frog/definitions"
import { MAX_NATIVE_SELECTION_LENGTH } from "@/types/native-selection"
import { streamBackgroundText } from "@/utils/content-script/background-stream-client"
import { createGlossaryMatcher } from "@/utils/glossary/matcher"
import { prepareTranslationText } from "@/utils/host/translate/text-preparation"
import { sendMessage } from "@/utils/message"
import { getTranslatePromptFromConfig } from "@/utils/prompts/translate"
import { resolveProviderRefForCapability } from "@/utils/providers/provider-registry"
import { ProviderSetupError } from "@/utils/providers/provider-setup-error"

export async function translateNativeSelection({
  text,
  config,
  signal,
  onChunk,
}: {
  text: string
  config: Config
  signal: AbortSignal
  onChunk: (chunk: BackgroundTextStreamSnapshot) => void
}) {
  const preparedText = prepareTranslationText(text)
  if (!preparedText || text.length > MAX_NATIVE_SELECTION_LENGTH) {
    throw new Error("Invalid selection length")
  }
  signal.throwIfAborted()
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
  const { systemPrompt, prompt } = getTranslatePromptFromConfig(
    config.pageTranslation,
    LANG_CODE_TO_EN_NAME[config.language.targetCode],
    preparedText,
    { glossaryTerms },
  )
  return streamBackgroundText(
    {
      providerKind: "local",
      providerId: provider.config.id,
      providerConfig: provider.config,
      instructions: systemPrompt,
      prompt,
    },
    {
      signal,
      onChunk: (chunk) => {
        if (!signal.aborted) onChunk(chunk)
      },
    },
  )
}
