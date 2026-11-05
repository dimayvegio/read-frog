import type { Config } from "@/types/config/config"
import type { OpenAIPublicConfig } from "@/types/config/openai"
import type { TranslationTextFormat } from "@/types/config/translate"
import type { PromptResolver } from "@/types/translation"
import type { MatchedTerm } from "@/utils/glossary/types"
import { LANG_CODE_TO_EN_NAME } from "@read-frog/definitions"
import { prepareTranslationText } from "@/utils/host/translate/text-preparation"
import { aiTranslate } from "./openai-translate"

export async function executeTranslate<TContext>(
  text: string,
  langConfig: Config["language"],
  providerConfig: OpenAIPublicConfig,
  promptResolver: PromptResolver<TContext>,
  options?: {
    isBatch?: boolean
    context?: TContext
    textFormat?: TranslationTextFormat
    preserveLineBreaks?: boolean
    signal?: AbortSignal
    glossaryTerms?: readonly MatchedTerm[]
  },
) {
  const prepared = prepareTranslationText(text)
  if (!prepared) return ""
  return (
    await aiTranslate(
      prepared,
      LANG_CODE_TO_EN_NAME[langConfig.targetCode],
      providerConfig,
      promptResolver,
      options,
    )
  ).trim()
}
