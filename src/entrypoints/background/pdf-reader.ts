import { z } from "zod"
import { browser } from "#imports"
import { onMessage } from "@/utils/message"
import { localPdfDocument } from "@/utils/selection-result/pdf-document"
import {
  getPdfReadingPosition,
  savePdfReadingPosition,
  forgetPdfReadingPosition,
} from "@/utils/selection-result/reading-position-db"
import { isTrustedOptionsSender, type SettingsSender } from "./settings-sender"

const PREFIX = "pdf-reader-source:"
const TTL = 30 * 60 * 1000
const sourceSchema = z.object({
  tabId: z.number().int().nonnegative(),
  documentId: z.string(),
  createdAt: z.number(),
})
export function requirePdfReaderSender(sender: SettingsSender, pages = ["pdf-reader.html"]) {
  if (
    !pages.some((page) =>
      isTrustedOptionsSender(
        sender,
        browser.runtime.id,
        new URL(page, browser.runtime.getURL("/")).href,
      ),
    )
  )
    throw new Error("This operation requires the Read Frog PDF reader")
}
export function setupPdfReaderHandlers() {
  onMessage("openPdfReader", async (message) => {
    requirePdfReaderSender(message.sender, ["sidepanel.html", "popup.html"])
    const windowId = z.number().int().nonnegative().parse(message.data?.windowId)
    const [tab] = await browser.tabs.query({ active: true, windowId })
    const source = localPdfDocument(tab?.url, tab?.title)
    let channel = ""
    if (source && tab?.id !== undefined) {
      const all = await browser.storage.session.get(null)
      const expired = Object.keys(all).filter(
        (key) =>
          key.startsWith(PREFIX) &&
          (!sourceSchema.safeParse(all[key]).success ||
            Date.now() - sourceSchema.parse(all[key]).createdAt > TTL),
      )
      if (expired.length) await browser.storage.session.remove(expired)
      channel = crypto.randomUUID()
      await browser.storage.session.set({
        [`${PREFIX}${channel}`]: { tabId: tab.id, documentId: source.id, createdAt: Date.now() },
      })
    }
    await browser.tabs.create({
      windowId,
      url: new URL(
        `pdf-reader.html${channel ? `?file=${channel}` : ""}`,
        browser.runtime.getURL("/"),
      ).href,
    })
  })
  onMessage("getPdfReaderSource", async (message) => {
    requirePdfReaderSender(message.sender)
    const channel = z.uuid().parse(message.data?.channel)
    const parsed = sourceSchema.safeParse(
      (await browser.storage.session.get(`${PREFIX}${channel}`))[`${PREFIX}${channel}`],
    )
    if (!parsed.success || Date.now() - parsed.data.createdAt > TTL) return null
    const value = parsed.data
    try {
      const tab = await browser.tabs.get(value.tabId)
      const document = localPdfDocument(tab.url, tab.title)
      return document?.id === value.documentId && tab.url ? { url: tab.url, document } : null
    } catch {
      return null
    }
  })
  onMessage("loadPdfReadingPosition", (message) => {
    requirePdfReaderSender(message.sender)
    return getPdfReadingPosition(message.data.documentId)
  })
  onMessage("savePdfReadingPosition", (message) => {
    requirePdfReaderSender(message.sender)
    return savePdfReadingPosition(message.data.position, message.data.epoch)
  })
  onMessage("forgetPdfReadingPosition", (message) => {
    requirePdfReaderSender(message.sender)
    return forgetPdfReadingPosition(message.data.documentId)
  })
}
