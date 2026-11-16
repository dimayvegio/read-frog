import type { Browser } from "#imports"
import type { Config } from "@/types/config/config"
import { browser, storage } from "#imports"
import { CONFIG_STORAGE_KEY } from "@/utils/constants/config"
import {
  getTranslationStateKey,
  parseTabIdFromStorageKey,
  TRANSLATION_STATE_KEY_PREFIX,
} from "@/utils/constants/storage-keys"
import { getSelectionToolbarActions } from "@/utils/custom-actions"
import { i18n } from "@/utils/i18n"
import { logger } from "@/utils/logger"
import { sendMessage } from "@/utils/message"
import { ensureInitializedConfig } from "./config"
import { openImageInTranslatePage } from "./image-translation"
import { isPdfContext, openNativePdfPanel, updateActiveNativePanelSelection } from "./native-panel"
import { openNativeSelectionResult } from "./native-selection"
import { getPageTranslationEnabled, setPageTranslationEnabled } from "./page-translation-state"

export const MENU_ID_TRANSLATE = "read-frog-translate"
export const MENU_ID_SELECTION_TRANSLATE = "read-frog-selection-translate"
export const MENU_ID_PDF_PANEL = "read-frog-pdf-panel"
export const MENU_ID_IMAGE_TRANSLATE = "read-frog-image-translate"
export const MENU_ID_SELECTION_READ_ALOUD = "read-frog-selection-read-aloud"
export const MENU_ID_SELECTION_CUSTOM_ACTION_PREFIX = "read-frog-selection-custom-action:"

function getSelectionCustomActionMenuId(actionId: string) {
  return `${MENU_ID_SELECTION_CUSTOM_ACTION_PREFIX}${actionId}`
}

/**
 * Register all context menu event listeners synchronously
 * This must be called during main() execution to ensure listeners are registered
 * before Chrome completes initialization
 */
export function registerContextMenuListeners() {
  // Listen for config changes to update context menu
  storage.watch<Config>(`local:${CONFIG_STORAGE_KEY}`, async (newConfig) => {
    if (newConfig) {
      await updateContextMenuItems(newConfig)
    }
  })

  // Listen for tab activation to update menu title
  browser.tabs.onActivated.addListener(async (activeInfo) => {
    await updateTranslateMenuTitle(activeInfo.tabId)
  })

  // Listen for tab updates (e.g., navigation)
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status === "complete") {
      await updateTranslateMenuTitle(tabId)
    }
  })

  // Listen for translation state changes in storage
  // This ensures menu updates when translation is toggled from any UI
  // (floating button, auto-translate, etc.) without interfering with
  // the translation logic in translation-signal.ts
  browser.storage.session.onChanged.addListener(async (changes) => {
    for (const [key, change] of Object.entries(changes)) {
      // Check if this is a translation state change
      if (key.startsWith(TRANSLATION_STATE_KEY_PREFIX.replace("session:", ""))) {
        const tabId = parseTabIdFromStorageKey(key)

        if (!Number.isNaN(tabId)) {
          // Only update menu if this is the active tab
          const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
          if (activeTab?.id === tabId) {
            const newValue = change.newValue as { enabled: boolean } | undefined
            await updateTranslateMenuTitle(tabId, newValue?.enabled)
          }
        }
      }
    }
  })

  // Handle menu item clicks
  browser.contextMenus.onClicked.addListener(handleContextMenuClick)
}

/**
 * Initialize context menu items based on config
 * This can be called asynchronously after listeners are registered
 */
export async function initializeContextMenu() {
  // Ensure config is initialized before setting up context menu
  const config = await ensureInitializedConfig()
  if (!config) {
    return
  }

  await updateContextMenuItems(config)
}

/**
 * Update context menu items based on config
 */
async function updateContextMenuItems(config: Config) {
  // Remove all existing menu items first
  await browser.contextMenus.removeAll()

  const { enabled: translateEnabled } = config.contextMenu
  const enabledCustomActions = getSelectionToolbarActions(config.selectionToolbar).filter(
    (action) => action.enabled !== false,
  )

  if (translateEnabled) {
    browser.contextMenus.create({
      id: MENU_ID_TRANSLATE,
      title: i18n.t("contextMenu.translate"),
      contexts: ["page"],
    })

    browser.contextMenus.create({
      id: MENU_ID_SELECTION_TRANSLATE,
      title: i18n.t("contextMenu.translateSelection"),
      contexts: ["selection"],
    })

    browser.contextMenus.create({
      id: MENU_ID_SELECTION_READ_ALOUD,
      title: i18n.t("contextMenu.readAloudSelection"),
      contexts: ["selection"],
    })

    if (enabledCustomActions.length > 0) {
      enabledCustomActions.forEach((action) => {
        browser.contextMenus.create({
          id: getSelectionCustomActionMenuId(action.id),
          title: action.name,
          contexts: ["selection"],
        })
      })
    }
    browser.contextMenus.create({
      id: MENU_ID_PDF_PANEL,
      title: "Dịch trong khung cố định",
      contexts: ["selection"],
    })
    browser.contextMenus.create({
      id: MENU_ID_IMAGE_TRANSLATE,
      title: i18n.t("contextMenu.translateImage"),
      contexts: ["image"],
    })
  }

  // Update translate menu title for current tab
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (activeTab?.id) {
    await updateTranslateMenuTitle(activeTab.id)
  }
}

/**
 * Update translate menu title based on current translation state
 * @param tabId - The tab ID to check translation state for
 * @param enabled - Optional: if provided, use this value instead of reading from storage
 */
async function updateTranslateMenuTitle(tabId: number, enabled?: boolean) {
  const config = await ensureInitializedConfig()
  if (!config?.contextMenu.enabled) {
    return
  }

  try {
    let isTranslated: boolean
    if (enabled !== undefined) {
      isTranslated = enabled
    } else {
      const state = await storage.getItem<{ enabled: boolean }>(getTranslationStateKey(tabId))
      isTranslated = state?.enabled ?? false
    }

    await browser.contextMenus.update(MENU_ID_TRANSLATE, {
      title: isTranslated ? i18n.t("contextMenu.showOriginal") : i18n.t("contextMenu.translate"),
    })
  } catch {
    // Menu item might not exist if translateEnabled is false
  }
}

/**
 * Handle context menu item click
 */
async function handleContextMenuClick(
  info: Browser.contextMenus.OnClickData,
  tab?: Browser.tabs.Tab,
) {
  if (
    info.menuItemId === MENU_ID_PDF_PANEL ||
    (info.menuItemId === MENU_ID_SELECTION_TRANSLATE && isPdfContext(info, tab))
  ) {
    if (info.selectionText?.trim()) {
      try {
        await openNativePdfPanel(info.selectionText.trim(), info, tab)
      } catch {
        logger.warn("Unable to open PDF translation")
      }
    }
    return
  }
  // Native PDF viewers can report a guest tab with id -1 (or no tab).
  // selectionText is still supplied by the browser's trusted context menu.
  if (info.menuItemId === MENU_ID_SELECTION_TRANSLATE) {
    await handleSelectionTranslateClick(info, tab)
    return
  }

  if (!isTabId(tab?.id)) {
    return
  }

  if (info.menuItemId === MENU_ID_TRANSLATE) {
    await handleTranslateClick(tab.id, tab.url)
    return
  }

  if (info.menuItemId === MENU_ID_SELECTION_READ_ALOUD) {
    await handleSelectionReadAloudClick(info, tab.id)
    return
  }

  if (info.menuItemId === MENU_ID_IMAGE_TRANSLATE) {
    await handleImageTranslateClick(info, tab)
    return
  }

  if (
    typeof info.menuItemId === "string" &&
    info.menuItemId.startsWith(MENU_ID_SELECTION_CUSTOM_ACTION_PREFIX)
  ) {
    const actionId = info.menuItemId.slice(MENU_ID_SELECTION_CUSTOM_ACTION_PREFIX.length)
    if (!actionId) {
      return
    }

    await handleSelectionCustomActionClick(info, tab.id, actionId)
  }
}

async function handleImageTranslateClick(
  info: Browser.contextMenus.OnClickData,
  tab?: Browser.tabs.Tab,
) {
  if (!isTabId(tab?.id) || tab.windowId === undefined) return
  const source = await browser.tabs.get(tab.id).catch(() => undefined)
  if (!source || source.url !== tab.url) return
  let image: string | undefined
  const src = info.srcUrl
  if (src && src.length <= 32 * 1024 * 1024 && /^data:image\/(?:png|jpeg);base64,/u.test(src))
    image = src
  if (!image && src) {
    try {
      const [result] = await browser.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
        func: (url: string) => {
          // Read the exact already-loaded image. No authenticated fetches,
          // cross-origin retries, unrelated image guesses or unbounded bodies.
          const img = Array.from(document.images).find(
            (candidate) => candidate.currentSrc === url || candidate.src === url,
          )
          if (
            !img?.complete ||
            !img.naturalWidth ||
            !img.naturalHeight ||
            img.naturalWidth * img.naturalHeight > 12_000_000
          )
            return null
          const scale = Math.min(
            1,
            4096 / Math.max(img.naturalWidth, img.naturalHeight),
            Math.sqrt(8_000_000 / (img.naturalWidth * img.naturalHeight)),
          )
          const canvas = document.createElement("canvas")
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
          try {
            canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
            return canvas.toDataURL("image/png")
          } catch {
            return null
          } finally {
            canvas.width = canvas.height = 1
          }
        },
        args: [src],
      })
      if (typeof result?.result === "string" && result.result.length <= 32 * 1024 * 1024)
        image = result.result
    } catch {
      /* Protected/tainted frame: ask for an explicit crop below. */
    }
  }
  const current = await browser.tabs.get(tab.id).catch(() => undefined)
  if (current?.url !== source.url) return
  try {
    if (image) {
      await openImageInTranslatePage(image, tab.windowId, true)
      return
    }
    const [active] = await browser.tabs.query({ active: true, windowId: tab.windowId })
    if (active?.id !== tab.id || active.url !== source.url) return
    const captured = await browser.tabs.captureVisibleTab(tab.windowId, { format: "png" })
    const [after] = await browser.tabs.query({ active: true, windowId: tab.windowId })
    if (after?.id !== tab.id || after.url !== source.url) return
    // A screenshot is not the selected image. Keep manual crop, never full=1.
    await openImageInTranslatePage(captured, tab.windowId)
  } catch {
    logger.warn("Không đọc được ảnh. Dùng Chụp vùng & dịch ảnh trong FlowRead.")
  }
}

/**
 * Handle translate menu click - toggle page translation
 */
async function handleTranslateClick(tabId: number, tabUrl?: string) {
  const isCurrentlyTranslated = await getPageTranslationEnabled(tabId)
  const newState = !isCurrentlyTranslated

  if (!newState) {
    await setPageTranslationEnabled(tabId, false, tabUrl, true)
    void sendMessage("notifyTranslationStateChanged", { enabled: false }, tabId).catch(() =>
      logger.warn("No content script for translation state"),
    )
  }

  // Notify content script in that specific tab
  void sendMessage(
    "askManagerToTogglePageTranslation",
    {
      enabled: newState,
    },
    tabId,
  ).catch(() => logger.warn("No content script for page translation"))

  // Update menu title immediately
  await updateTranslateMenuTitle(tabId, newState)
}

async function handleSelectionTranslateClick(
  info: Browser.contextMenus.OnClickData,
  tab?: Browser.tabs.Tab,
) {
  const selectionText = info.selectionText?.trim()
  if (!selectionText) {
    return
  }

  if (isTabId(tab?.id)) {
    if (
      await updateActiveNativePanelSelection(selectionText, tab, undefined, info.frameId).catch(
        () => false,
      )
    )
      return
    const tabId = tab.id
    const target = typeof info.frameId === "number" ? { tabId, frameId: info.frameId } : tabId
    try {
      await sendMessage("openSelectionTranslationFromContextMenu", { selectionText }, target)
      return
    } catch {
      // Protected documents cannot host our in-page selection UI.
    }
  }

  let sourceTabId = isTabId(tab?.id) ? tab.id : undefined
  if (sourceTabId === undefined) {
    // Resolve the browser tab for lifecycle/reuse only. Never send a guest
    // frame's message to an unrelated top-level content script.
    const tabs = await browser.tabs
      .query({
        active: true,
        ...(isTabId(tab?.windowId) ? { windowId: tab.windowId } : { lastFocusedWindow: true }),
      })
      .catch(() => [])
    if (isTabId(tabs[0]?.id)) sourceTabId = tabs[0].id
  }

  try {
    const metadata = isTabId(tab?.id) ? await fallbackHtmlSource(info, tab) : undefined
    if (metadata) await openNativeSelectionResult(selectionText, sourceTabId, undefined, metadata)
    else await openNativeSelectionResult(selectionText, sourceTabId)
  } catch {
    logger.warn("Unable to open the selection translation window")
  }
}

/** Read-only, exact-frame MIME probe: an absent receiver is not proof of HTML. */
async function fallbackHtmlSource(info: Browser.contextMenus.OnClickData, tab: Browser.tabs.Tab) {
  const url = info.frameUrl ?? info.pageUrl ?? tab.url
  if (!isTabId(tab.id) || !url || !/^(https?|file):/.test(url) || isPdfContext(info, tab))
    return undefined
  const tabId = tab.id,
    frameId = info.frameId ?? 0
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => {
        const before = await browser.webNavigation.getFrame({ tabId, frameId })
        if (before?.url !== url) return undefined
        const [probe] = await browser.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          func: () => ({ contentType: document.contentType, url: location.href }),
        })
        const after = await browser.webNavigation.getFrame({ tabId, frameId })
        if (
          probe?.frameId !== frameId ||
          probe.result?.url !== url ||
          after?.url !== url ||
          !["text/html", "application/xhtml+xml"].includes(probe.result.contentType)
        )
          return undefined
        if (before.documentId || after.documentId || probe.documentId) {
          if (
            !before.documentId ||
            !after.documentId ||
            !probe.documentId ||
            before.documentId !== after.documentId ||
            after.documentId !== probe.documentId
          )
            return undefined
        }
        return { source: { kind: "web" as const }, sourceTitle: tab.title?.slice(0, 240) }
      })().catch(() => undefined),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), 2000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function isTabId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id >= 0
}

async function handleSelectionReadAloudClick(
  info: Browser.contextMenus.OnClickData,
  tabId: number,
) {
  const selectionText = info.selectionText?.trim()
  if (!selectionText) {
    return
  }

  const target = typeof info.frameId === "number" ? { tabId, frameId: info.frameId } : tabId

  void sendMessage("readAloudSelectionFromContextMenu", { selectionText }, target).catch(() =>
    logger.warn("No content script for selection speech"),
  )
}

async function handleSelectionCustomActionClick(
  info: Browser.contextMenus.OnClickData,
  tabId: number,
  actionId: string,
) {
  const selectionText = info.selectionText?.trim()
  if (!selectionText) {
    return
  }

  const target = typeof info.frameId === "number" ? { tabId, frameId: info.frameId } : tabId

  void sendMessage(
    "openSelectionCustomActionFromContextMenu",
    {
      actionId,
      selectionText,
    },
    target,
  ).catch(() => logger.warn("No content script for selection action"))
}
