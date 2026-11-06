import type { ContentScriptContext } from "#imports"
import { XCOM_STATUS_POLL_INTERVAL_MS } from "@/utils/constants/subtitles"
import { bindSubtitlesToggleShortcut } from "./bind-subtitles-toggle-shortcut"
import { createXcomSubtitlesAdapter } from "./platforms/xcom"
import { getXcomConfig } from "./platforms/xcom/config"
import {
  getCurrentPrimaryXcomStatusVideo,
  getCurrentXcomVideoId,
  getXcomStatusVideoContainer,
} from "./platforms/xcom/dom"
import {
  clearXcomOverlayEntryPoints,
  ensureXcomOverlayEntryPoint,
  mountXcomTranslateButton,
} from "./platforms/xcom/overlay-entry"
import { watchXcomPlayer } from "./platforms/xcom/watch-player"
import { mountSubtitlesSidebar, unmountSubtitlesSidebar } from "./renderer/mount-subtitles-sidebar"
import { mountSubtitlesUI, unmountSubtitlesUI } from "./renderer/mount-subtitles-ui"

function isXcomHost(): boolean {
  const { hostname } = window.location
  return (
    hostname === "x.com" ||
    hostname.endsWith(".x.com") ||
    hostname === "twitter.com" ||
    hostname.endsWith(".twitter.com")
  )
}

function getCurrentVideoContainer(): HTMLElement | null {
  const video = getCurrentPrimaryXcomStatusVideo()
  return video ? getXcomStatusVideoContainer(video) : null
}

export function initXcomSubtitles(ctx: ContentScriptContext) {
  if (!isXcomHost()) {
    return
  }

  const config = getXcomConfig()
  let adapter: ReturnType<typeof createXcomSubtitlesAdapter> | null = null
  let initialized = false
  let lastVideoId: string | null = null
  let lastVideoContainer: HTMLElement | null = null
  let invalidated = false

  const remount = async (activeAdapter: NonNullable<typeof adapter>) => {
    lastVideoContainer = getCurrentVideoContainer()
    lastVideoId = getCurrentXcomVideoId()
    await mountSubtitlesUI({ adapter: activeAdapter, config })
    activeAdapter.notifyNavigation()
  }

  const syncEntryPoint = () => {
    if (invalidated || !adapter || !ensureXcomOverlayEntryPoint()) {
      return
    }

    mountXcomTranslateButton(adapter)

    if (initialized && getCurrentVideoContainer() !== lastVideoContainer) {
      void remount(adapter)
    }
  }

  ctx.onInvalidated(watchXcomPlayer(syncEntryPoint))

  const tryInit = async () => {
    if (invalidated) return
    if (!getCurrentVideoContainer() || !ensureXcomOverlayEntryPoint()) {
      return
    }

    adapter ??= createXcomSubtitlesAdapter(config)
    await mountSubtitlesUI({ adapter, config })
    if (invalidated) return
    mountSubtitlesSidebar(adapter)

    lastVideoId = getCurrentXcomVideoId()
    lastVideoContainer = getCurrentVideoContainer()

    if (initialized) {
      return
    }

    initialized = true
    const unbindToggleShortcut = await bindSubtitlesToggleShortcut(adapter)
    if (invalidated) {
      unbindToggleShortcut()
      return
    }
    ctx.onInvalidated(unbindToggleShortcut)
    void adapter.initialize()
  }

  void tryInit()

  const intervalId = setInterval(() => {
    if (invalidated) return
    const videoContainer = getCurrentVideoContainer()
    if (!videoContainer) {
      // Or the overlay's React root stays alive inside a discarded player.
      clearXcomOverlayEntryPoints()
      if (lastVideoContainer) {
        unmountSubtitlesUI()
        adapter?.notifyLeave()
      }
      lastVideoId = null
      lastVideoContainer = null
      return
    }

    if (!adapter || !initialized) {
      void tryInit()
      return
    }

    const videoId = getCurrentXcomVideoId()
    if (videoId === lastVideoId && videoContainer === lastVideoContainer) {
      syncEntryPoint()
      return
    }

    if (ensureXcomOverlayEntryPoint()) {
      void remount(adapter)
    }
  }, XCOM_STATUS_POLL_INTERVAL_MS)

  ctx.onInvalidated(() => clearInterval(intervalId))
  ctx.onInvalidated(() => {
    invalidated = true
    clearXcomOverlayEntryPoints()
    adapter?.destroy()
    unmountSubtitlesUI()
    unmountSubtitlesSidebar()
  })
}
