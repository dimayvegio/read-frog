import type { Browser } from "#imports"
import { sha256 } from "js-sha256"
import { browser } from "#imports"
import {
  MAX_NATIVE_SELECTION_LENGTH,
  NATIVE_SELECTION_STORAGE_PREFIX,
  NATIVE_PANEL_STORAGE_PREFIX,
  NATIVE_SELECTION_TTL_MS,
  NATIVE_PANEL_VIEW_PORT,
  type NativeSelectionRequest,
} from "@/types/native-selection"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { onMessage, sendMessage } from "@/utils/message"
import { identifyPdfDocument } from "@/utils/selection-result/pdf-document"
import { openNativeSelectionResult } from "./native-selection"
import { isTrustedOptionsSender } from "./settings-sender"
import { getSidePanelApi } from "./side-panel"

interface PanelSelection extends NativeSelectionRequest {
  sourceTabId?: number
  panelWindowId: number
  sourceRouteHash?: string
  sourceFrameId?: number
}
// Only a mounted extension-owned view may receive subsequent explicit HTML translations.
const mounted = new Map<number, Set<Browser.runtime.Port>>()
const highlights = new Map<number, { tabId: number; frameId: number }>()
function clearPanelHighlight(windowId: number) {
  const owner = highlights.get(windowId)
  highlights.delete(windowId)
  if (owner)
    void sendMessage("updateNativePanelHighlight", { selectionText: null }, owner).catch(() => {})
}
function updatePanelHighlight(request: PanelSelection) {
  if (request.source?.kind !== "web" || !validId(request.sourceTabId)) {
    clearPanelHighlight(request.panelWindowId)
    return
  }
  const owner = { tabId: request.sourceTabId, frameId: request.sourceFrameId ?? 0 }
  const previous = highlights.get(request.panelWindowId)
  if (previous && (previous.tabId !== owner.tabId || previous.frameId !== owner.frameId))
    clearPanelHighlight(request.panelWindowId)
  highlights.set(request.panelWindowId, owner)
  void sendMessage("updateNativePanelHighlight", { selectionText: request.text }, owner).catch(
    () => {},
  )
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
    const pdf = isPdfContext(info, source)
    const document = pdf
      ? identifyPdfDocument(
          info.pageUrl && /^file:|^https?:/.test(info.pageUrl) ? info.pageUrl : source?.url,
          source?.title,
        )
      : undefined
    const canPanel = await opening
    if (!canPanel || windowId === undefined) {
      if (pdf)
        await openNativeSelectionResult(text, validId(source?.id) ? source.id : undefined, document)
      else
        await openNativeSelectionResult(
          text,
          validId(source?.id) ? source.id : undefined,
          undefined,
          {
            source: { kind: "web" },
            sourceTitle: source?.title?.slice(0, 240),
          },
        )
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
      ...(source?.url ? { sourceRouteHash: sha256(source.url) } : {}),
      sourceFrameId: validId(info.frameId) ? info.frameId : 0,
      source: { kind: pdf ? "pdf" : "web" },
      ...(!pdf && source?.title ? { sourceTitle: source.title.slice(0, 240) } : {}),
      ...(document ? { document } : {}),
    }
    await browser.storage.session.set({ [key]: selectionId, [selectionKey]: request })
    updatePanelHighlight(request)
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
/** Update only the same source route in a mounted panel; never opens a view or calls a provider. */
export function updateActiveNativePanelSelection(
  text: string,
  tab: Browser.tabs.Tab,
  current: () => Promise<boolean> = async () => true,
  frameId?: number,
): Promise<boolean> {
  const task = panelQueue.then(async () => {
    const windowId = tab.windowId
    if (
      !text.trim() ||
      !validId(tab.id) ||
      !validId(windowId) ||
      !tab.url ||
      !mounted.get(windowId)?.size
    )
      return false
    const key = `${NATIVE_PANEL_STORAGE_PREFIX}${windowId}`
    const selectionId = (await browser.storage.session.get(key))[key]
    if (typeof selectionId !== "string" || !/^[\da-f-]{36}$/i.test(selectionId)) return false
    const selectionKey = `${NATIVE_SELECTION_STORAGE_PREFIX}${selectionId}`
    const previous = (await browser.storage.session.get(selectionKey))[selectionKey] as
      | PanelSelection
      | undefined
    if (
      previous?.source?.kind !== "web" ||
      previous.panelWindowId !== windowId ||
      previous.sourceTabId !== tab.id ||
      previous.sourceRouteHash !== sha256(tab.url) ||
      Date.now() - previous.createdAt >= NATIVE_SELECTION_TTL_MS
    )
      return false
    if (!(await current()) || !mounted.get(windowId)?.size) return false
    const latest = await browser.tabs.get(tab.id).catch(() => null)
    if (
      !latest ||
      latest.windowId !== windowId ||
      latest.url !== tab.url ||
      !mounted.get(windowId)?.size ||
      !(await current())
    )
      return false
    const request: PanelSelection = {
      ...previous,
      id: getRandomUUID(),
      createdAt: Date.now(),
      text: text.length > MAX_NATIVE_SELECTION_LENGTH ? "" : text.trim(),
      tooLong: text.length > MAX_NATIVE_SELECTION_LENGTH,
      ...(validId(frameId) ? { sourceFrameId: frameId } : {}),
    }
    await browser.storage.session.set({ [selectionKey]: request })
    updatePanelHighlight(request)
    return true
  })
  panelQueue = task.catch(() => {})
  return task
}
export function setupNativePanelHandlers() {
  mounted.clear()
  highlights.clear()
  const api = getSidePanelApi(browser)
  if (api?.kind === "chromium-side-panel")
    api.api.onClosed?.addListener(({ windowId }) => {
      if (validId(windowId)) {
        mounted.delete(windowId)
        clearPanelHighlight(windowId)
      }
    })
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== NATIVE_PANEL_VIEW_PORT) return
    if (
      !isTrustedOptionsSender(
        port.sender,
        browser.runtime.id,
        browser.runtime.getURL("/sidepanel.html"),
      )
    ) {
      port.disconnect()
      return
    }
    let owner: number | undefined
    const cleanup = () => {
      if (owner === undefined) return
      const ports = mounted.get(owner)
      ports?.delete(port)
      if (!ports?.size) {
        mounted.delete(owner)
        clearPanelHighlight(owner)
      }
    }
    port.onMessage.addListener((message) => {
      if (owner !== undefined || !validId(message?.windowId) || mounted.size >= 64) return
      owner = message.windowId
      const ports = mounted.get(owner!) ?? new Set<Browser.runtime.Port>()
      ports.add(port)
      mounted.set(owner!, ports)
    })
    port.onDisconnect.addListener(cleanup)
  })
  onMessage("routeSelectionToNativePanel", async ({ data, sender }) => {
    if (
      sender.id !== browser.runtime.id ||
      !validId(sender.tab?.id) ||
      !validId(sender.tab?.windowId) ||
      !Number.isInteger(sender.frameId) ||
      (sender.frameId ?? -1) < 0 ||
      typeof data?.selectionText !== "string"
    )
      return false
    const tab = await browser.tabs.get(sender.tab.id).catch(() => null)
    if (!tab || !mounted.get(tab.windowId)?.size) return false
    return updateActiveNativePanelSelection(
      data.selectionText,
      tab,
      async () => {
        const frame = await browser.webNavigation
          .getFrame({ tabId: tab.id!, frameId: sender.frameId! })
          .catch(() => null)
        if (!frame || !/^(https?|file):/.test(frame.url)) return false
        if (frame.documentId || sender.documentId)
          return !!frame.documentId && !!sender.documentId && frame.documentId === sender.documentId
        return frame.url === sender.url
      },
      sender.frameId,
    )
  })
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
    const { id, text, createdAt, tooLong, document, source, sourceTitle } = stored
    return {
      id,
      text,
      createdAt,
      tooLong,
      ...(document ? { document } : {}),
      ...(source ? { source } : {}),
      ...(sourceTitle ? { sourceTitle } : {}),
    }
  })
  browser.windows.onRemoved.addListener((windowId) => {
    mounted.delete(windowId)
    clearPanelHighlight(windowId)
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
