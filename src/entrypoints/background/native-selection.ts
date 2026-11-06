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
  sourceTabId?: number
}

let openQueue: Promise<unknown> = Promise.resolve()
const selectionKey = (selectionId: string) => `${NATIVE_SELECTION_STORAGE_PREFIX}${selectionId}`
const resultURL = () => browser.runtime.getURL("/selection-result.html")

async function openResult(
  selectionText: string,
  sourceTabId?: number,
  document?: NativeSelectionRequest["document"],
) {
  const text = selectionText.trim()
  if (!text) return
  const stored = await browser.storage.session.get(null)
  const selections = Object.entries(stored).filter(([key]) =>
    key.startsWith(NATIVE_SELECTION_STORAGE_PREFIX),
  ) as Array<[string, StoredSelection]>
  const expired = selections
    .filter(([, value]) => Date.now() - value.createdAt >= NATIVE_SELECTION_TTL_MS)
    .map(([key]) => key)
  if (expired.length) await browser.storage.session.remove(expired)

  // Keep selected text in trusted, temporary extension storage; never in a URL,
  // public settings, settings exports, or a PDF upload.
  const request: StoredSelection = {
    id: getRandomUUID(),
    text: text.length > MAX_NATIVE_SELECTION_LENGTH ? "" : text,
    tooLong: text.length > MAX_NATIVE_SELECTION_LENGTH,
    createdAt: Date.now(),
    ...(document ? { document } : {}),
    sourceTabId:
      typeof sourceTabId === "number" && Number.isSafeInteger(sourceTabId) && sourceTabId >= 0
        ? sourceTabId
        : undefined,
  }
  // The popup reads an opaque session channel, independent of guest tab IDs.
  // Without a real source tab, give each selection its own channel/window.
  const previousEntry = selections.find(
    ([key, value]) =>
      !expired.includes(key) &&
      request.sourceTabId !== undefined &&
      value.sourceTabId === request.sourceTabId,
  )
  const previousWindowId = previousEntry?.[1].windowId
  if (previousWindowId !== undefined && previousEntry) {
    const [previousKey] = previousEntry
    const existing = await browser.windows
      .get(previousWindowId, { populate: true })
      .catch(() => null)
    const url = `${resultURL()}?selectionId=${previousKey.slice(NATIVE_SELECTION_STORAGE_PREFIX.length)}`
    const resultTab = existing?.tabs?.find((tab) => tab.url === url)
    if (resultTab?.id !== undefined && existing?.id !== undefined) {
      request.windowId = existing.id
      await browser.storage.session.set({ [previousKey]: request })
      await browser.windows.update(existing.id, { focused: true })
      return
    }
  }
  if (previousEntry) await browser.storage.session.remove(previousEntry[0])
  const selectionId = getRandomUUID()
  const key = selectionKey(selectionId)
  const url = `${resultURL()}?selectionId=${selectionId}`
  await browser.storage.session.set({ [key]: request })
  try {
    const popup = await browser.windows.create({ url, type: "popup", width: 480, height: 480 })
    // The source may close while windows.create is pending. Do not resurrect
    // its text or leave a result window whose request has already been removed.
    if (!(await browser.storage.session.get(key))[key]) {
      if (popup?.id !== undefined) await browser.windows.remove(popup.id).catch(() => {})
      return
    }
    // Preserve this request's id: the UI ignores the metadata-only update.
    request.windowId = popup?.id
    await browser.storage.session.set({ [key]: request })
  } catch (error) {
    await browser.storage.session.remove(key)
    throw error
  }
}

export function openNativeSelectionResult(
  text: string,
  sourceTabId?: number,
  document?: NativeSelectionRequest["document"],
): Promise<void> {
  const task = openQueue.then(() => openResult(text, sourceTabId, document))
  openQueue = task.catch(() => {})
  return task
}

export function setupNativeSelectionHandlers() {
  onMessage("getNativeSelection", async (message) => {
    if (!isTrustedOptionsSender(message.sender, browser.runtime.id, resultURL())) {
      throw new Error("This operation requires the selection result window")
    }
    const selectionId = message.data?.selectionId
    if (
      typeof selectionId !== "string" ||
      !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(selectionId)
    )
      throw new Error("Invalid selection channel")
    const key = selectionKey(selectionId)
    const stored = (await browser.storage.session.get(key))[key] as StoredSelection | undefined
    if (!stored) return null
    if (Date.now() - stored.createdAt >= NATIVE_SELECTION_TTL_MS) {
      await browser.storage.session.remove(key)
      return null
    }
    const { id, text, createdAt, tooLong, document } = stored
    return { id, text, createdAt, tooLong, ...(document ? { document } : {}) }
  })
  browser.tabs.onRemoved.addListener((tabId) => {
    void (async () => {
      const stored = await browser.storage.session.get(null)
      const entries = Object.entries(stored).filter(
        ([key, value]) =>
          key.startsWith(NATIVE_SELECTION_STORAGE_PREFIX) &&
          (value as StoredSelection).sourceTabId === tabId,
      ) as Array<[string, StoredSelection]>
      if (entries.length) await browser.storage.session.remove(entries.map(([key]) => key))
      for (const [, request] of entries) {
        if (request.windowId !== undefined) {
          await browser.windows.remove(request.windowId).catch(() => {})
        }
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
