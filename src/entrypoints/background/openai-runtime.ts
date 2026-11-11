import type { UsageTask } from "@/utils/usage/schema"
import { createOpenAI } from "@ai-sdk/openai"
import { openAIPublicConfigSchema } from "@/types/config/openai"
import { resolveModelId } from "@/utils/providers/model-id"
import { buildOpenAIGenerateParams } from "@/utils/providers/openai-profile"
import { ProviderSetupError } from "@/utils/providers/provider-setup-error"
import { ensureInitializedConfig } from "./config"
import { readOpenAIExecutionCredential } from "./openai-credentials"
import { instrumentModel } from "./usage"

/** Fixed Responses boundary. Audio features use their own fixed OpenAI endpoints. */
export const openAIOnlyFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  const url = new URL(request.url)
  if (
    url.origin !== "https://api.openai.com" ||
    url.username ||
    url.password ||
    url.pathname !== "/v1/responses" ||
    url.search ||
    url.hash ||
    request.method !== "POST"
  ) {
    throw new Error("OpenAI endpoint is not allowed")
  }
  request.signal.throwIfAborted()
  return fetch(request, { credentials: "omit", redirect: "error" })
}

export async function resolveOpenAIExecution(
  input: unknown,
  options: { signal?: AbortSignal; usageTask?: UsageTask } = {},
) {
  options.signal?.throwIfAborted()
  const snapshot = openAIPublicConfigSchema.parse(input)
  const modelId = resolveModelId(snapshot.model)
  if (!modelId) throw new ProviderSetupError("Choose an OpenAI model in settings")
  await ensureInitializedConfig()
  const { apiKey, revision } = await readOpenAIExecutionCredential()
  options.signal?.throwIfAborted()
  if (!apiKey) throw new ProviderSetupError("Configure an OpenAI API key in settings")
  const client = createOpenAI({
    apiKey,
    baseURL: "https://api.openai.com/v1",
    fetch: openAIOnlyFetch,
  })
  return {
    model: instrumentModel(client.languageModel(modelId), options.usageTask ?? "other"),
    params: buildOpenAIGenerateParams(snapshot),
    credentialRevision: revision,
  }
}
