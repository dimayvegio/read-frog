import type { Browser } from "#imports"
import { browser } from "#imports"
import {
  MAX_NATIVE_SELECTION_LENGTH,
  NATIVE_SELECTION_STORAGE_PREFIX,
  NATIVE_PANEL_STORAGE_PREFIX,
  NATIVE_SELECTION_TTL_MS,
  type NativeSelectionRequest,
} from "@/types/native-selection"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { onMessage } from "@/utils/message"
import { identifyPdfDocument } from "@/utils/selection-result/pdf-document"
import { openNativeSelectionResult } from "./native-selection"
import { isTrustedOptionsSender } from "./settings-sender"
import { getSidePanelApi } from "./side-panel"

interface PanelSelection extends NativeSelectionRequest {
  sourceTabId?: number
  panelWindowId: number
}
const validId = (id: unknown): id is number =>
  typeof id === "number" && Number.isSafeInteger(id) && id >= 0
export function isPdfContext(info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab) {
  return [info.pageUrl, info.frameUrl, tab?.url].some((value) => {
    try {
      return /\.pdf$/i.test(new URL(value ?? "").pathname)
    } catch {
      return false
    }
  })
}
let panelQueue: Promise<unknown> = Promise.resolve()
let lastFocusedWindowId: number | undefined
// Called directly by the trusted context-menu listener, before any await, so
// sidePanel.open retains the browser's user gesture. Never focus a new window.
export function openNativePdfPanel(
  text: string,
  info: Browser.contextMenus.OnClickData,
  tab?: Browser.tabs.Tab,
): Promise<void> {
  if (!text.trim()) return Promise.resolve()
  const api = getSidePanelApi(browser)
  const windowId = validId(tab?.windowId) ? tab.windowId : lastFocusedWindowId
  let opening: Promise<boolean>
  try {
    opening =
      api?.kind === "chromium-side-panel" && windowId !== undefined
        ? Promise.resolve(api.api.open({ windowId })).then(
            () => true,
            () => false,
          )
        : Promise.resolve(false)
  } catch {
    opening = Promise.resolve(false)
  }
  const task = panelQueue.then(async () => {
    if (!text.trim()) return
    const source = validId(tab?.id)
      ? tab
      : (
          await browser.tabs
            .query({
              active: true,
              ...(windowId !== undefined ? { windowId } : { lastFocusedWindow: true }),
            })
            .catch(() => [])
        )[0]
    const document = identifyPdfDocument(
      info.pageUrl && /^file:|^https?:/.test(info.pageUrl) ? info.pageUrl : source?.url,
      source?.title,
    )
    const canPanel = await opening
    if (!canPanel || windowId === undefined) {
      await openNativeSelectionResult(text, validId(source?.id) ? source.id : undefined, document)
      return
    }
    const key = `${NATIVE_PANEL_STORAGE_PREFIX}${windowId}`
    const previous = (await browser.storage.session.get(key))[key] as string | undefined
    const selectionId = getRandomUUID(),
      selectionKey = `${NATIVE_SELECTION_STORAGE_PREFIX}${selectionId}`
    const request: PanelSelection = {
      id: getRandomUUID(),
      text: text.length > MAX_NATIVE_SELECTION_LENGTH ? "" : text.trim(),
      tooLong: text.length > MAX_NATIVE_SELECTION_LENGTH,
      createdAt: Date.now(),
      panelWindowId: windowId,
      ...(validId(source?.id) ? { sourceTabId: source.id } : {}),
      ...(document ? { document } : {}),
    }
    await browser.storage.session.set({ [key]: selectionId, [selectionKey]: request })
    if (previous)
      await browser.storage.session.remove(`${NATIVE_SELECTION_STORAGE_PREFIX}${previous}`)
    // The source can close while storage is being updated.
    if (
      request.sourceTabId !== undefined &&
      !(await browser.tabs.get(request.sourceTabId).catch(() => null))
    )
      await browser.storage.session.remove([key, selectionKey])
  })
  panelQueue = task.catch(() => {})
  return task
}
export function setupNativePanelHandlers() {
  lastFocusedWindowId = undefined
  void browser.windows
    .getLastFocused()
    .then((window) => {
      if (lastFocusedWindowId === undefined && validId(window?.id)) lastFocusedWindowId = window.id
    })
    .catch(() => {})
  browser.windows.onFocusChanged.addListener((windowId) => {
    if (validId(windowId)) lastFocusedWindowId = windowId
  })
  onMessage("getNativePanelSelection", async (message) => {
    if (
      !isTrustedOptionsSender(
        message.sender,
        browser.runtime.id,
        browser.runtime.getURL("/sidepanel.html"),
      )
    )
      throw new Error("This operation requires the PDF side panel")
    const windowId = message.data?.windowId
    if (!validId(windowId)) throw new Error("Invalid panel window")
    const key = `${NATIVE_PANEL_STORAGE_PREFIX}${windowId}`,
      selectionId = (await browser.storage.session.get(key))[key]
    if (typeof selectionId !== "string" || !/^[\da-f-]{36}$/i.test(selectionId)) return null
    const selectionKey = `${NATIVE_SELECTION_STORAGE_PREFIX}${selectionId}`
    const stored = (await browser.storage.session.get(selectionKey))[selectionKey] as
      | PanelSelection
      | undefined
    if (!stored || stored.panelWindowId !== windowId) return null
    if (Date.now() - stored.createdAt >= NATIVE_SELECTION_TTL_MS) {
      await browser.storage.session.remove([key, selectionKey])
      return null
    }
    const { id, text, createdAt, tooLong, document } = stored
    return { id, text, createdAt, tooLong, ...(document ? { document } : {}) }
  })
  browser.windows.onRemoved.addListener((windowId) => {
    if (lastFocusedWindowId === windowId) lastFocusedWindowId = undefined
    void (async () => {
      const stored = await browser.storage.session.get(null)
      const keys = Object.entries(stored)
        .filter(
          ([key, value]) =>
            key === `${NATIVE_PANEL_STORAGE_PREFIX}${windowId}` ||
            (key.startsWith(NATIVE_SELECTION_STORAGE_PREFIX) &&
              (value as PanelSelection).panelWindowId === windowId),
        )
        .map(([key]) => key)
      if (keys.length) await browser.storage.session.remove(keys)
    })()
  })
}
