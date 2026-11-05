import { generateText } from "ai"
import { browser } from "#imports"
import { openAIPublicConfigSchema } from "@/types/config/openai"
import { onMessage } from "@/utils/message"
import { getOpenAIOutputIdentity } from "@/utils/providers/openai-profile"
import { ensureInitializedConfig, getInitialConfig } from "./config"
import { deleteOpenAIKey, readOpenAIKeyStatus, saveOpenAIKey } from "./openai-credentials"
import { resolveOpenAIExecution } from "./openai-runtime"
import { isTrustedOptionsSender } from "./settings-sender"

function requireOptions(sender: Parameters<typeof isTrustedOptionsSender>[0]) {
  if (!isTrustedOptionsSender(sender, browser.runtime.id, browser.runtime.getURL("/options.html")))
    throw new Error("This operation requires the extension settings page")
}

export function setupOpenAISettingsHandlers() {
  onMessage("getInitialConfig", async (message) => {
    if (message.data?.retry) requireOptions(message.sender)
    const result = await getInitialConfig(message.data?.retry === true)
    return result.ok ? { ...result, config: await ensureInitializedConfig() } : result
  })
  onMessage("getOpenAIKeyStatus", async () => {
    await ensureInitializedConfig()
    return readOpenAIKeyStatus()
  })
  onMessage("saveOpenAIKey", async (message) => {
    requireOptions(message.sender)
    await ensureInitializedConfig()
    try {
      return await saveOpenAIKey(message.data.key)
    } catch {
      throw new Error("Unable to save OpenAI credential. Check the input and local storage.")
    }
  })
  onMessage("deleteOpenAIKey", async (message) => {
    requireOptions(message.sender)
    await ensureInitializedConfig()
    return deleteOpenAIKey()
  })
  onMessage("testOpenAIConnection", async (message) => {
    requireOptions(message.sender)
    await ensureInitializedConfig()
    const snapshot = openAIPublicConfigSchema.parse(message.data)
    const status = await readOpenAIKeyStatus()
    const identity = {
      credentialRevision: status.revision,
      snapshotIdentity: getOpenAIOutputIdentity(snapshot),
    }
    if (!status.configured) return { ...identity, ok: false, code: "NOT_CONFIGURED" as const }
    try {
      const execution = await resolveOpenAIExecution(snapshot)
      identity.credentialRevision = execution.credentialRevision
      await generateText({
        model: execution.model,
        ...execution.params,
        prompt: "Reply with OK.",
        maxOutputTokens: 64,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(30000),
      })
      return { ...identity, credentialRevision: execution.credentialRevision, ok: true }
    } catch (error) {
      // Never serialize a raw SDK error: it may carry request headers and bodies.
      const statusCode =
        error && typeof error === "object" && "statusCode" in error ? error.statusCode : undefined
      const code =
        statusCode === 401 || statusCode === 403
          ? ("AUTHENTICATION_FAILED" as const)
          : statusCode === 429
            ? ("RATE_LIMITED" as const)
            : ("CONNECTION_FAILED" as const)
      return { ...identity, ok: false, code }
    }
  })
}
