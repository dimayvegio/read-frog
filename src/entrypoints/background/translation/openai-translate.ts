import type { OpenAIPublicConfig } from "@/types/config/openai"
import type { PromptResolver } from "@/types/translation"
import type { MatchedTerm } from "@/utils/glossary/types"
import { generateText } from "ai"
import { safeOpenAIErrorMessage } from "@/utils/error/openai"
import { attachRequestErrorMeta, getRequestErrorMeta } from "@/utils/request/retry-policy"
import { resolveOpenAIExecution } from "../openai-runtime"

const THINK_TAG_RE = /<\/think>([\s\S]*)/

export async function aiTranslate<TContext>(
  text: string,
  targetLangName: string,
  providerConfig: OpenAIPublicConfig,
  promptResolver: PromptResolver<TContext>,
  options?: {
    isBatch?: boolean
    context?: TContext
    signal?: AbortSignal
    // Forwarded verbatim to the prompt resolver: the terms were resolved by the
    // context that knew the page URL, and re-resolving here would scope them
    // wrong (see `TranslatePromptOptions.glossaryTerms`).
    glossaryTerms?: readonly MatchedTerm[]
  },
) {
  const execution = await resolveOpenAIExecution(providerConfig, { signal: options?.signal })
  const { systemPrompt, prompt } = await promptResolver(targetLangName, text, options)

  try {
    const { text: translatedText } = await generateText({
      model: execution.model,
      ...execution.params,
      instructions: systemPrompt,
      prompt,
      abortSignal: options?.signal,
      maxRetries: 0, // Disable SDK built-in retries, let RequestQueue/BatchQueue handle it
    })

    const [, finalTranslation = translatedText] = translatedText.match(THINK_TAG_RE) || []

    return finalTranslation
  } catch (error) {
    const message = safeOpenAIErrorMessage(error)
    const meta = getRequestErrorMeta(error)
    const safeError =
      error instanceof Error && error.name === "AbortError"
        ? new DOMException("Request cancelled", "AbortError")
        : new Error(message)
    throw attachRequestErrorMeta(safeError, meta)
  }
}
