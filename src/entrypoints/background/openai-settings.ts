import { generateText } from "ai"
import { browser } from "#imports"
import { openAIPublicConfigSchema } from "@/types/config/openai"
import { onMessage } from "@/utils/message"
import { getOpenAIOutputIdentity } from "@/utils/providers/openai-profile"
import { ensureInitializedConfig, getInitialConfig } from "./config"
import {
  deleteOpenAIKey,
  readOpenAIExecutionCredential,
  readOpenAIKeyStatus,
  saveOpenAIKey,
} from "./openai-credentials"
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
      const execution = await resolveOpenAIExecution(snapshot, { usageTask: "connection" })
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
  onMessage("fetchOpenAILiveModels", async (message) => {
    requireOptions(message.sender)
    await ensureInitializedConfig()
    const credential = await readOpenAIExecutionCredential()
    if (!credential?.apiKey) {
      return { ok: false, models: [], error: "NOT_CONFIGURED" }
    }
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${credential.apiKey}` },
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        return {
          ok: false,
          models: [],
          error:
            response.status === 401 || response.status === 403
              ? "AUTHENTICATION_FAILED"
              : "HTTP_ERROR",
        }
      }
      const reader = response.body?.getReader()
      if (!reader) throw new Error("Empty catalog")
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > 1024 * 1024) throw new Error("Catalog too large")
          chunks.push(value)
        }
      } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      const json: unknown = JSON.parse(new TextDecoder().decode(bytes))
      const data =
        json && typeof json === "object" && "data" in json && Array.isArray(json.data)
          ? json.data
          : []
      const models = Array.from(
        new Set(
          data.slice(0, 10000).flatMap((item: unknown) => {
            if (!item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string")
              return []
            const id = item.id.trim()
            return id.length <= 128 &&
              /^(?:gpt|o1|o3|o4|chatgpt|whisper)[a-z0-9:._-]*$/iu.test(id) &&
              !/realtime|audio-preview/iu.test(id)
              ? [id]
              : []
          }),
        ),
      )
        .sort()
        .slice(0, 1000)
      if ((await readOpenAIExecutionCredential()).revision !== credential.revision)
        throw new Error("Credential changed")
      return { ok: true, models }
    } catch {
      return { ok: false, models: [], error: "NETWORK_ERROR" }
    }
  })
}
