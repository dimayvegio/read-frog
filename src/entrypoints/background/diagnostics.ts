import { z } from "zod"
import { browser } from "#imports"
import { buildDiagnosticsReport } from "@/utils/diagnostics/report"
import { LOG_LEVELS } from "@/utils/logging/logger"
import { sanitizeLogFields, sanitizeLogMessage } from "@/utils/logging/sanitize"
import { MAX_FORWARDED_BATCH } from "@/utils/logging/sinks/forward"
import { storeLogRecords } from "@/utils/logging/sinks/persist"
import { FORWARDING_LOG_CONTEXTS } from "@/utils/logging/stored-record"
import { onMessage } from "@/utils/message"
import { isTrustedOptionsSender, type SettingsSender } from "./settings-sender"

const forwardedRecordsSchema = z.object({
  context: z.enum(FORWARDING_LOG_CONTEXTS),
  records: z
    .array(
      z.object({
        time: z.number(),
        level: z.enum(LOG_LEVELS),
        scope: z.string().max(200),
        message: z.string().max(2000),
        fields: z.record(z.string(), z.json()),
      }),
    )
    .max(MAX_FORWARDED_BATCH),
})

function getHost(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).host || undefined
  } catch {
    return undefined
  }
}

export function setupDiagnosticsHandlers(): void {
  // What the other contexts log; a content script's records also get its tab and site.
  onMessage("storeLogRecords", ({ data, sender }) => {
    if (sender.id !== browser.runtime.id || !data || typeof data !== "object") return
    const envelope = data as { records?: unknown[]; context?: string }
    if (!Array.isArray(envelope.records) || envelope.records.length > MAX_FORWARDED_BATCH) return
    try {
      if (JSON.stringify(data).length > 256 * 1024) return
    } catch {
      return
    }
    const parsed = forwardedRecordsSchema.safeParse(data)
    if (!parsed.success) return

    const { context, records } = parsed.data
    if (context === "content") {
      if (!sender.tab || !sender.url || !/^(?:https?|file):/u.test(sender.url)) return
    } else if (
      !isTrustedOptionsSender(
        sender,
        browser.runtime.id,
        new URL(`/${context}.html`, browser.runtime.getURL("/")).href,
      )
    )
      return
    const origin = context === "content" ? { tabId: sender.tab?.id, host: getHost(sender.url) } : {}
    storeLogRecords(
      records.map((record) => ({
        ...record,
        scope: sanitizeLogMessage(record.scope).slice(0, 200),
        message: sanitizeLogMessage(record.message),
        fields: sanitizeLogFields(record.fields),
        context,
        ...origin,
      })),
    )
  })

  onMessage("getDiagnosticsReport", ({ sender }) => {
    const trusted = [
      browser.runtime.getURL("/options.html"),
      browser.runtime.getURL("/popup.html"),
    ].some((url) => isTrustedOptionsSender(sender as SettingsSender, browser.runtime.id, url))
    if (!trusted) throw new Error("Diagnostics export requires the settings page")
    return buildDiagnosticsReport()
  })
}
