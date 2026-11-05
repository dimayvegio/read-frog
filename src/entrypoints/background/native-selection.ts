import type { NativeSelectionRequest } from "@/types/native-selection"
import { browser } from "#imports"
import {
  MAX_NATIVE_SELECTION_LENGTH,
  NATIVE_SELECTION_STORAGE_PREFIX,
  NATIVE_SELECTION_TTL_MS,
} from "@/types/native-selection"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { onMessage } from "@/utils/message"
import { isTrustedOptionsSender } from "./settings-sender"

interface StoredSelection extends NativeSelectionRequest {
  windowId?: number
}

let openQueue: Promise<unknown> = Promise.resolve()
const selectionKey = (tabId: number) => `${NATIVE_SELECTION_STORAGE_PREFIX}${tabId}`
const resultURL = () => browser.runtime.getURL("/selection-result.html")

async function openResult(selectionText: string, tabId: number) {
  const text = selectionText.trim()
  if (!text) return
  const stored = await browser.storage.session.get(null)
  const expired = Object.entries(stored)
    .filter(
      ([key, value]) =>
        key.startsWith(NATIVE_SELECTION_STORAGE_PREFIX) &&
        Date.now() - (value as StoredSelection).createdAt >= NATIVE_SELECTION_TTL_MS,
    )
    .map(([key]) => key)
  if (expired.length) await browser.storage.session.remove(expired)

  // Keep selected text in trusted, temporary extension storage; never in a URL,
  // public settings, settings exports, or a PDF upload.
  const request: StoredSelection = {
    id: getRandomUUID(),
    text: text.length > MAX_NATIVE_SELECTION_LENGTH ? "" : text,
    tooLong: text.length > MAX_NATIVE_SELECTION_LENGTH,
    createdAt: Date.now(),
  }
  const key = selectionKey(tabId)
  const previous = stored[key] as StoredSelection | undefined
  const url = `${resultURL()}?sourceTabId=${tabId}`
  if (previous?.windowId !== undefined) {
    const existing = await browser.windows
      .get(previous.windowId, { populate: true })
      .catch(() => null)
    const resultTab = existing?.tabs?.find((tab) => tab.url === url)
    if (resultTab?.id !== undefined && existing?.id !== undefined) {
      request.windowId = existing.id
      await browser.storage.session.set({ [key]: request })
      await browser.windows.update(existing.id, { focused: true })
      return
    }
  }
  await browser.storage.session.set({ [key]: request })
  const popup = await browser.windows.create({ url, type: "popup", width: 480, height: 480 })
  // Preserve this request's id: the UI ignores the metadata-only update.
  request.windowId = popup?.id
  await browser.storage.session.set({ [key]: request })
}

export function openNativeSelectionResult(text: string, tabId: number): Promise<void> {
  const task = openQueue.then(() => openResult(text, tabId))
  openQueue = task.catch(() => {})
  return task
}

export function setupNativeSelectionHandlers() {
  onMessage("getNativeSelection", async (message) => {
    if (!isTrustedOptionsSender(message.sender, browser.runtime.id, resultURL())) {
      throw new Error("This operation requires the selection result window")
    }
    const tabId = message.data?.sourceTabId
    if (!Number.isSafeInteger(tabId) || tabId < 0) throw new Error("Invalid source tab")
    const key = selectionKey(tabId)
    const stored = (await browser.storage.session.get(key))[key] as StoredSelection | undefined
    if (!stored) return null
    if (Date.now() - stored.createdAt >= NATIVE_SELECTION_TTL_MS) {
      await browser.storage.session.remove(key)
      return null
    }
    const { id, text, createdAt, tooLong } = stored
    return { id, text, createdAt, tooLong }
  })
  browser.tabs.onRemoved.addListener((tabId) => {
    void (async () => {
      const key = selectionKey(tabId)
      const request = (await browser.storage.session.get(key))[key] as StoredSelection | undefined
      await browser.storage.session.remove(key)
      if (request?.windowId !== undefined) {
        await browser.windows.remove(request.windowId).catch(() => {})
      }
    })()
  })
  browser.windows.onRemoved.addListener((windowId) => {
    void (async () => {
      const stored = await browser.storage.session.get(null)
      const keys = Object.entries(stored)
        .filter(
          ([key, value]) =>
            key.startsWith(NATIVE_SELECTION_STORAGE_PREFIX) &&
            (value as StoredSelection).windowId === windowId,
        )
        .map(([key]) => key)
      if (keys.length) await browser.storage.session.remove(keys)
    })()
  })
}
