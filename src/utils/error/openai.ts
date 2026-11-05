import { ProviderSetupError } from "@/utils/providers/provider-setup-error"

/** Safe across a message boundary; never exposes SDK request/response bodies. */
export function safeOpenAIErrorMessage(error: unknown): string {
  if (error instanceof ProviderSetupError)
    return "Configure an OpenAI API key and model in settings."
  if (error && typeof error === "object" && "statusCode" in error) {
    if (error.statusCode === 401 || error.statusCode === 403)
      return "OpenAI rejected this API key or model access. Check your OpenAI settings."
    if (error.statusCode === 429)
      return "OpenAI rate or usage limit reached. Check your OpenAI account and retry later."
  }
  if (error instanceof Error && error.name === "AbortError") return "Request cancelled."
  return "Unable to complete the OpenAI request. Check settings and try again."
}
