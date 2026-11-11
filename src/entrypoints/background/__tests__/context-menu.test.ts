import type { Config } from "@/types/config/config"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { browser, storage } from "#imports"
import { i18n } from "@/utils/i18n"
import { logger } from "@/utils/logger"
import {
  initializeContextMenu,
  MENU_ID_SELECTION_CUSTOM_ACTION_PREFIX,
  MENU_ID_SELECTION_READ_ALOUD,
  MENU_ID_SELECTION_TRANSLATE,
  MENU_ID_TRANSLATE,
  MENU_ID_PDF_PANEL,
  registerContextMenuListeners,
} from "../context-menu"

// vi.mock factories run during the static imports above, before this module's
// own top-level code, so the mocks they return must be hoisted with them.
const { sendMessageMock, ensureInitializedConfigMock, openNativeSelectionMock } = vi.hoisted(
  () => ({
    sendMessageMock: vi.fn<(...args: any[]) => any>(),
    ensureInitializedConfigMock: vi.fn<(...args: any[]) => any>(),
    openNativeSelectionMock: vi.fn<(...args: any[]) => any>(),
  }),
)
const storageSetItemMock = vi.fn<(...args: any[]) => any>()
const contextMenuClickListeners: Array<(info: any, tab?: any) => Promise<void> | void> = []

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
}))

vi.mock("../config", () => ({
  ensureInitializedConfig: ensureInitializedConfigMock,
}))

vi.mock("../native-selection", () => ({ openNativeSelectionResult: openNativeSelectionMock }))

function createConfig(enabled: boolean): Config {
  return {
    contextMenu: {
      enabled,
    },
    selectionToolbar: {
      builtInActions: {
        dictionary: {
          enabled: false,
          providerId: "openai-default",
        },
        sentenceAnalysis: {
          enabled: false,
          providerId: "openai-default",
        },
      },
      customActions: [],
    },
  } as unknown as Config
}

describe("background context menu", () => {
  beforeEach(() => {
    contextMenuClickListeners.length = 0
    vi.clearAllMocks()
    sendMessageMock.mockReset().mockResolvedValue(undefined)
    openNativeSelectionMock.mockReset().mockResolvedValue(undefined)

    browser.contextMenus.create = vi.fn<(...args: any[]) => any>()
    browser.contextMenus.removeAll = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined)
    browser.contextMenus.update = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined)
    browser.contextMenus.onClicked.addListener = vi.fn<(...args: any[]) => any>((listener) => {
      contextMenuClickListeners.push(listener as (info: any, tab?: any) => Promise<void> | void)
    })

    browser.tabs.query = vi.fn<(...args: any[]) => any>().mockResolvedValue([{ id: 1 }])
    browser.tabs.onActivated.addListener = vi.fn<(...args: any[]) => any>()
    browser.tabs.onUpdated.addListener = vi.fn<(...args: any[]) => any>()
    browser.storage.session.onChanged.addListener = vi.fn<(...args: any[]) => any>()

    storage.watch = vi.fn<(...args: any[]) => any>()
    storage.getItem = vi.fn<(...args: any[]) => any>().mockResolvedValue({ enabled: true })
    storage.setItem = storageSetItemMock
    storageSetItemMock.mockResolvedValue(undefined)

    i18n.t = vi.fn<(...args: any[]) => any>(
      (key: string) =>
        ({
          "contextMenu.translate": "Translate",
          "contextMenu.translateSelection": 'Translate "%s"',
          "contextMenu.readAloudSelection": 'Read aloud "%s"',
          "contextMenu.showOriginal": "Show Original",
          "options.selectionToolbar.customActions.templates.dictionary.name": "Dictionary",
          "options.selectionToolbar.customActions.templates.sentenceAnalysis.name":
            "Sentence Analysis",
        })[key] ?? key,
    ) as typeof i18n.t
  })

  it("catches undeliverable page/speech/action messages while retaining native PDF selection fallback", async () => {
    sendMessageMock.mockRejectedValue(new Error("No receiver"))
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {})
    registerContextMenuListeners()
    const click = contextMenuClickListeners[0]!
    for (const menuItemId of [
      MENU_ID_TRANSLATE,
      MENU_ID_SELECTION_TRANSLATE,
      MENU_ID_SELECTION_READ_ALOUD,
      `${MENU_ID_SELECTION_CUSTOM_ACTION_PREFIX}dictionary`,
    ])
      await click({ menuItemId, selectionText: "PDF text" }, { id: 5, url: "edge://version/" })
    await Promise.resolve()
    expect(openNativeSelectionMock).toHaveBeenCalledWith("PDF text", 5)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
  it("creates page and selection menu items when the context menu is enabled", async () => {
    ensureInitializedConfigMock.mockResolvedValue(createConfig(true))

    await initializeContextMenu()

    expect(browser.contextMenus.removeAll).toHaveBeenCalledOnce()
    expect(browser.contextMenus.create).toHaveBeenCalledWith({
      id: MENU_ID_PDF_PANEL,
      title: "Dịch trong khung cố định (PDF)",
      contexts: ["selection"],
    })
    expect(browser.contextMenus.create).toHaveBeenNthCalledWith(1, {
      id: MENU_ID_TRANSLATE,
      title: "Translate",
      contexts: ["page"],
    })
    expect(browser.contextMenus.create).toHaveBeenNthCalledWith(2, {
      id: MENU_ID_SELECTION_TRANSLATE,
      title: 'Translate "%s"',
      contexts: ["selection"],
    })
    expect(browser.contextMenus.create).toHaveBeenNthCalledWith(3, {
      id: MENU_ID_SELECTION_READ_ALOUD,
      title: 'Read aloud "%s"',
      contexts: ["selection"],
    })
    expect(browser.contextMenus.update).toHaveBeenCalledWith(MENU_ID_TRANSLATE, {
      title: "Show Original",
    })
  })

  it("creates custom action items inline for enabled custom actions", async () => {
    const config = createConfig(true)
    config.selectionToolbar.customActions = [
      { id: "dictionary", name: "Dictionary", enabled: true },
      { id: "disabled", name: "Disabled", enabled: false },
      { id: "rewrite", name: "Rewrite", enabled: true },
    ] as Config["selectionToolbar"]["customActions"]
    ensureInitializedConfigMock.mockResolvedValue(config)

    await initializeContextMenu()

    expect(browser.contextMenus.create).toHaveBeenNthCalledWith(4, {
      id: `${MENU_ID_SELECTION_CUSTOM_ACTION_PREFIX}dictionary`,
      title: "Dictionary",
      contexts: ["selection"],
    })
    expect(browser.contextMenus.create).toHaveBeenNthCalledWith(5, {
      id: `${MENU_ID_SELECTION_CUSTOM_ACTION_PREFIX}rewrite`,
      title: "Rewrite",
      contexts: ["selection"],
    })
  })

  it("creates the built-in Dictionary item when it is enabled", async () => {
    const config = createConfig(true)
    config.selectionToolbar.builtInActions.dictionary.enabled = true
    ensureInitializedConfigMock.mockResolvedValue(config)

    await initializeContextMenu()

    expect(browser.contextMenus.create).toHaveBeenNthCalledWith(4, {
      id: `${MENU_ID_SELECTION_CUSTOM_ACTION_PREFIX}default-dictionary`,
      title: "Dictionary",
      contexts: ["selection"],
    })
  })

  it("creates the built-in Sentence Analysis item after the Dictionary's", async () => {
    const config = createConfig(true)
    config.selectionToolbar.builtInActions.dictionary.enabled = true
    config.selectionToolbar.builtInActions.sentenceAnalysis.enabled = true
    ensureInitializedConfigMock.mockResolvedValue(config)

    await initializeContextMenu()

    expect(browser.contextMenus.create).toHaveBeenNthCalledWith(5, {
      id: `${MENU_ID_SELECTION_CUSTOM_ACTION_PREFIX}default-sentence-analysis`,
      title: "Sentence Analysis",
      contexts: ["selection"],
    })
  })

  it("removes menu items without recreating them when the context menu is disabled", async () => {
    ensureInitializedConfigMock.mockResolvedValue(createConfig(false))

    await initializeContextMenu()

    expect(browser.contextMenus.removeAll).toHaveBeenCalledOnce()
    expect(browser.contextMenus.create).not.toHaveBeenCalled()
    expect(browser.contextMenus.update).not.toHaveBeenCalled()
  })

  it("records a scoped user refusal when the translate menu disables translation", async () => {
    registerContextMenuListeners()

    const clickHandler = contextMenuClickListeners[0]
    if (!clickHandler) {
      throw new Error("Context menu click listener was not registered")
    }

    // storage.getItem defaults to { enabled: true }, so this click toggles off.
    await clickHandler(
      { menuItemId: MENU_ID_TRANSLATE },
      { id: 5, url: "https://example.com/articles/1" },
    )

    expect(storageSetItemMock).toHaveBeenCalledWith("session:translationState.5", {
      enabled: false,
      userDisabled: true,
      origin: "https://example.com",
    })
  })

  it("routes selection menu clicks to the matching tab and frame", async () => {
    registerContextMenuListeners()

    const clickHandler = contextMenuClickListeners[0]
    if (!clickHandler) {
      throw new Error("Context menu click listener was not registered")
    }

    await clickHandler(
      {
        menuItemId: MENU_ID_SELECTION_TRANSLATE,
        selectionText: "Selected text",
        frameId: 7,
      },
      {
        id: 5,
      },
    )

    expect(sendMessageMock).toHaveBeenCalledWith(
      "openSelectionTranslationFromContextMenu",
      { selectionText: "Selected text" },
      { tabId: 5, frameId: 7 },
    )
  })

  it("opens an extension result when the native PDF has no content receiver", async () => {
    sendMessageMock.mockRejectedValueOnce(
      new Error("Could not establish connection. Receiving end does not exist."),
    )
    registerContextMenuListeners()
    await contextMenuClickListeners[0]!(
      {
        menuItemId: MENU_ID_SELECTION_TRANSLATE,
        selectionText: "  Only this PDF paragraph  ",
        frameId: 3,
      },
      { id: 8, url: "file:///private/document.pdf" },
    )
    expect(openNativeSelectionMock).toHaveBeenCalledExactlyOnceWith("Only this PDF paragraph", 8, {
      id: expect.any(String),
      title: "document.pdf",
    })
  })

  it("keeps ordinary selection translation in the existing in-page UI", async () => {
    sendMessageMock.mockResolvedValueOnce(undefined)
    registerContextMenuListeners()
    await contextMenuClickListeners[0]!(
      { menuItemId: MENU_ID_SELECTION_TRANSLATE, selectionText: "HTML selection" },
      { id: 8 },
    )
    expect(openNativeSelectionMock).not.toHaveBeenCalled()
  })

  it("resolves a native PDF guest tab without sending its frame to another content script", async () => {
    browser.tabs.query = vi.fn<(...args: any[]) => any>().mockResolvedValue([{ id: 8 }])
    registerContextMenuListeners()
    await contextMenuClickListeners[0]!(
      { menuItemId: MENU_ID_SELECTION_TRANSLATE, selectionText: "PDF selection", frameId: 7 },
      { id: -1, windowId: 6 },
    )
    expect(browser.tabs.query).toHaveBeenCalledExactlyOnceWith({ active: true, windowId: 6 })
    expect(sendMessageMock).not.toHaveBeenCalled()
    expect(openNativeSelectionMock).toHaveBeenCalledExactlyOnceWith("PDF selection", 8)
  })

  it("opens a selection even when neither the menu nor tabs.query supplies a source tab", async () => {
    browser.tabs.query = vi
      .fn<(...args: any[]) => any>()
      .mockRejectedValue(new Error("Tab unavailable"))
    registerContextMenuListeners()
    await contextMenuClickListeners[0]!({
      menuItemId: MENU_ID_SELECTION_TRANSLATE,
      selectionText: "PDF selection",
    })
    expect(sendMessageMock).not.toHaveBeenCalled()
    expect(openNativeSelectionMock).toHaveBeenCalledExactlyOnceWith("PDF selection", undefined)
  })

  it("ignores empty selections without opening a result or making a request", async () => {
    registerContextMenuListeners()
    await contextMenuClickListeners[0]!(
      { menuItemId: MENU_ID_SELECTION_TRANSLATE, selectionText: " \n " },
      { id: 8 },
    )
    expect(openNativeSelectionMock).not.toHaveBeenCalled()
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it("handles a result-window failure without an unhandled rejection", async () => {
    sendMessageMock.mockRejectedValueOnce(new Error("No receiver"))
    openNativeSelectionMock.mockRejectedValueOnce(new Error("Window unavailable"))
    registerContextMenuListeners()
    await expect(
      contextMenuClickListeners[0]!(
        { menuItemId: MENU_ID_SELECTION_TRANSLATE, selectionText: "PDF selection" },
        { id: 8 },
      ),
    ).resolves.toBeUndefined()
  })

  it("routes read aloud menu clicks to the matching tab and frame", async () => {
    registerContextMenuListeners()

    const clickHandler = contextMenuClickListeners[0]
    if (!clickHandler) {
      throw new Error("Context menu click listener was not registered")
    }

    await clickHandler(
      {
        menuItemId: MENU_ID_SELECTION_READ_ALOUD,
        selectionText: "Selected text",
        frameId: 4,
      },
      {
        id: 2,
      },
    )

    expect(sendMessageMock).toHaveBeenCalledWith(
      "readAloudSelectionFromContextMenu",
      { selectionText: "Selected text" },
      { tabId: 2, frameId: 4 },
    )
  })

  it("routes custom action menu clicks to the matching tab and frame", async () => {
    registerContextMenuListeners()

    const clickHandler = contextMenuClickListeners[0]
    if (!clickHandler) {
      throw new Error("Context menu click listener was not registered")
    }

    await clickHandler(
      {
        menuItemId: `${MENU_ID_SELECTION_CUSTOM_ACTION_PREFIX}dictionary`,
        selectionText: "Selected text",
        frameId: 7,
      },
      {
        id: 5,
      },
    )

    expect(sendMessageMock).toHaveBeenCalledWith(
      "openSelectionCustomActionFromContextMenu",
      { actionId: "dictionary", selectionText: "Selected text" },
      { tabId: 5, frameId: 7 },
    )
  })
})
