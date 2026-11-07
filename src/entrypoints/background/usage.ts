import { wrapLanguageModel, type LanguageModelMiddleware } from "ai"
import { browser } from "#imports"
import { onMessage } from "@/utils/message"
import {
  usageDB,
  usageEpoch,
  saveUsage,
  clearUsage,
  usageSnapshot,
  saveUsagePrice,
} from "@/utils/usage/db"
import { usageTaskSchema, type UsageEntry, type UsageTask } from "@/utils/usage/schema"
import { isTrustedOptionsSender } from "./settings-sender"

export async function beginUsage(task: UsageTask, model: string) {
  const epoch = await usageEpoch().catch(() => null),
    start = performance.now()
  const base = {
    id: crypto.randomUUID(),
    at: Date.now(),
    task,
    model,
    durationMs: 0,
    firstTokenMs: null,
    input: null,
    output: null,
    cachedInput: null,
    cacheWrite: null,
    audioMs: null,
  } satisfies Omit<UsageEntry, "status">
  let saved = false
  return {
    finish: async (
      status: UsageEntry["status"],
      fields: Partial<
        Pick<
          UsageEntry,
          "input" | "output" | "cachedInput" | "cacheWrite" | "firstTokenMs" | "audioMs"
        >
      > = {},
    ) => {
      if (saved || epoch === null) return
      saved = true
      // Only numeric usage and task metadata enter this DB. Never prompts,
      // responses, URLs, credential revisions or SDK errors.
      await saveUsage(
        { ...base, ...fields, status, durationMs: Math.max(0, performance.now() - start) },
        epoch,
      ).catch(() => {})
    },
    start,
  }
}
export async function recordCacheHit(task: UsageTask) {
  const span = await beginUsage(task, "")
  await span.finish("cache", { input: 0, output: 0, cachedInput: 0, cacheWrite: 0 })
}
export function usageMiddleware(task: UsageTask): LanguageModelMiddleware {
  return {
    wrapGenerate: async ({ doGenerate, model, params }) => {
      const span = await beginUsage(task, model.modelId)
      try {
        const result = await doGenerate(),
          usage = result.usage
        await span.finish("complete", {
          input: usage.inputTokens.total ?? null,
          output: usage.outputTokens.total ?? null,
          cachedInput: usage.inputTokens.cacheRead ?? null,
          cacheWrite: usage.inputTokens.cacheWrite ?? null,
        })
        return result
      } catch (error) {
        await span.finish(params.abortSignal?.aborted ? "cancelled" : "error")
        throw error
      }
    },
    wrapStream: async ({ doStream, model, params }) => {
      const span = await beginUsage(task, model.modelId)
      try {
        const result = await doStream(),
          reader = result.stream.getReader()
        let first: number | null = null,
          failed = false
        const stream: typeof result.stream = new ReadableStream({
          async pull(controller) {
            try {
              const chunk = await reader.read()
              if (chunk.done) {
                await span.finish(
                  params.abortSignal?.aborted ? "cancelled" : failed ? "error" : "cancelled",
                  { firstTokenMs: first },
                )
                controller.close()
                return
              }
              const part = chunk.value
              if (first === null && (part.type === "text-delta" || part.type === "reasoning-delta"))
                first = performance.now() - span.start
              if (part.type === "error") failed = true
              if (part.type === "finish") {
                const usage = part.usage
                await span.finish(failed ? "error" : "complete", {
                  input: usage.inputTokens.total ?? null,
                  output: usage.outputTokens.total ?? null,
                  cachedInput: usage.inputTokens.cacheRead ?? null,
                  cacheWrite: usage.inputTokens.cacheWrite ?? null,
                  firstTokenMs: first,
                })
              }
              controller.enqueue(part)
            } catch (error) {
              await span.finish(params.abortSignal?.aborted ? "cancelled" : "error", {
                firstTokenMs: first,
              })
              controller.error(error)
            }
          },
          async cancel(reason) {
            await reader.cancel(reason).catch(() => {})
            await span.finish("cancelled", { firstTokenMs: first })
          },
        })
        return { ...result, stream }
      } catch (error) {
        await span.finish(params.abortSignal?.aborted ? "cancelled" : "error")
        throw error
      }
    },
  }
}
export function instrumentModel(
  model: Parameters<typeof wrapLanguageModel>[0]["model"],
  task: UsageTask,
) {
  return wrapLanguageModel({ model, middleware: usageMiddleware(task) })
}
export function setupUsageHandlers() {
  const requireDashboard = (sender: Parameters<typeof isTrustedOptionsSender>[0]) => {
    if (!isTrustedOptionsSender(sender, browser.runtime.id, browser.runtime.getURL("/usage.html")))
      throw new Error("Open the usage dashboard")
  }
  onMessage("getUsageSnapshot", async (message) => {
    requireDashboard(message.sender)
    return usageSnapshot()
  })
  onMessage("clearUsage", async (message) => {
    requireDashboard(message.sender)
    await clearUsage()
  })
  onMessage("saveUsagePrice", async (message) => {
    requireDashboard(message.sender)
    await saveUsagePrice(message.data)
  })
  onMessage("setUsageBudget", async (message) => {
    requireDashboard(message.sender)
    const value = message.data.usd
    if (!Number.isFinite(value) || value < 0 || value > 100000) throw new Error("Invalid budget")
    await usageDB.meta.put({ key: "monthlyBudget", value })
  })
  onMessage("recordLocalCacheHit", async (message) => {
    await recordCacheHit(usageTaskSchema.parse(message.data.task))
  })
  onMessage("openUsageDashboard", async () => {
    await browser.tabs.create({ url: browser.runtime.getURL("/usage.html"), active: true })
  })
}
