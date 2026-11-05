import type { TranslatePromptOptions, TranslatePromptResult } from "@/utils/prompts/translate"
export type PromptResolver<TContext = unknown> = (
  targetLang: string,
  input: string,
  options?: TranslatePromptOptions<TContext>,
) => Promise<TranslatePromptResult>
