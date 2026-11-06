import "@/utils/zod-config"
import type { Config, UiLanguage } from "@/types/config/config"
import { browser, defineBackground } from "#imports"
import { OPENAI_TTS_PORT } from "@/types/openai-tts"
import { storageAdapter } from "@/utils/atoms/storage-adapter"
import { setBackgroundConfigReadyResolver } from "@/utils/config/readiness"
import { CONFIG_STORAGE_KEY } from "@/utils/constants/config"
import { initI18n, setUiLanguage } from "@/utils/i18n"
import { logger } from "@/utils/logger"
import { onMessage } from "@/utils/message"
import { openOptionsPage } from "@/utils/navigation"
import { runAiSegmentSubtitles } from "./ai-segmentation"
import { dispatchBackgroundStreamPort } from "./background-stream"
import { initializeActionIcons, registerActionIconListeners } from "./browser-action-icon"
import { ensureInitializedConfig } from "./config"
import { setUpConfigBackup } from "./config-backup"
import { initializeContextMenu, registerContextMenuListeners } from "./context-menu"
import {
  cleanupAllAiSegmentationCache,
  cleanupAllSummaryCache,
  cleanupAllTranslationCache,
  setUpDatabaseCleanup,
} from "./db-cleanup"
import { setupEdgeTTSMessageHandlers } from "./edge-tts"
import { setupGlossaryMessageHandlers } from "./glossary"
import { setupIframeInjection } from "./iframe-injection"
import { setupLLMGenerateTextMessageHandlers } from "./llm-generate-text"
import { setupNativeSelectionHandlers } from "./native-selection"
import { setupOpenAISettingsHandlers } from "./openai-settings"
import { handleOpenAITTSPort } from "./openai-tts"
import { setupPageTranslationHandlers } from "./page-translation"
import { setupSidePanelMessageHandler } from "./side-panel"
import { setupSubtitlesTranslationHandlers } from "./subtitles-translation"
import { translationMessage } from "./translation-signal"
import { setupTTSPlaybackMessageHandlers } from "./tts-playback"
import { setupVideoSummaryHandlers } from "./video-summary"

export default defineBackground({
  type: "module",
  main: () => {
    setBackgroundConfigReadyResolver(ensureInitializedConfig)
    // MV3 listeners register in this turn; handlers await the shared bootstrap.
    setupOpenAISettingsHandlers()
    browser.runtime.onInstalled.addListener(async (details) => {
      if (details.reason === "install") await openOptionsPage({ route: "/api-providers" })
    })
    onMessage("openTranslationHub", async () => {
      await browser.tabs.create({
        url: browser.runtime.getURL("/translation-hub.html"),
        active: true,
      })
    })
    onMessage("openOptionsPage", async (message) => {
      await openOptionsPage(message.data)
    })
    setupSidePanelMessageHandler({
      extensionBrowser: browser,
      logger,
      registerMessageHandler: onMessage,
    })
    onMessage("aiSegmentSubtitles", async (message) => runAiSegmentSubtitles(message.data))
    browser.runtime.onConnect.addListener((port) => {
      if (port.name === OPENAI_TTS_PORT) {
        handleOpenAITTSPort(port)
        return
      }
      dispatchBackgroundStreamPort(port)
    })
    onMessage("clearAllTranslationRelatedCache", async () => {
      await cleanupAllTranslationCache()
      await cleanupAllSummaryCache()
    })
    onMessage("clearAiSegmentationCache", async () => {
      await cleanupAllAiSegmentationCache()
    })
    translationMessage()
    registerActionIconListeners()
    registerContextMenuListeners()
    setupNativeSelectionHandlers()
    setupPageTranslationHandlers()
    setupSubtitlesTranslationHandlers()
    setupVideoSummaryHandlers()
    setupGlossaryMessageHandlers()
    setupEdgeTTSMessageHandlers()
    setupTTSPlaybackMessageHandlers()
    setupLLMGenerateTextMessageHandlers()
    setupIframeInjection()
    setUpConfigBackup()
    void setUpDatabaseCleanup()
    void initializeActionIcons()

    let currentUiLanguage: UiLanguage | undefined
    const backgroundReady = (async () => {
      try {
        const config = await ensureInitializedConfig()
        currentUiLanguage = config.uiLanguage
        await initI18n(currentUiLanguage)
        await initializeContextMenu()
        return true
      } catch {
        logger.warn("Settings recovery is required")
        return false
      }
    })()
    storageAdapter.watch<Config>(CONFIG_STORAGE_KEY, (config) => {
      void (async () => {
        await backgroundReady
        // A successful options retry may have recovered after startup failed.
        await ensureInitializedConfig()
        if (config.uiLanguage === currentUiLanguage) return
        currentUiLanguage = config.uiLanguage
        await setUiLanguage(config.uiLanguage)
        await initializeContextMenu()
      })().catch(() => {
        logger.warn("Settings recovery is required")
      })
    })
  },
})
