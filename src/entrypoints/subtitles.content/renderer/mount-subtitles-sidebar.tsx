import type { SubtitlesProvidersAdapter } from "../universal-adapter"
import themeCSS from "@/assets/styles/theme.css?inline"
import { SUBTITLES_SIDEBAR_HOST_ID, SUBTITLES_THEME } from "@/utils/constants/subtitles"
import {
  createReactShadowHost,
  removeReactShadowHost,
} from "@/utils/react-shadow-host/create-shadow-host"
import {
  applySidebarRect,
  defaultSidebarRect,
  sidebarViewport,
} from "@/utils/subtitles/sidebar-window"
import { SubtitlesSidebar } from "../ui/subtitles-sidebar"
import { SubtitlesProviders } from "../ui/subtitles-ui-context"

/**
 * Fullscreen renders only the fullscreen element's subtree, so the host has to
 * follow it in and out; anywhere else it lives on <body>, where the host page's
 * SPA re-renders cannot detach it.
 */
function followFullscreen(shadowHost: HTMLElement): () => void {
  const reparent = () => {
    const parent = document.fullscreenElement ?? document.body
    if (shadowHost.parentElement !== parent) parent.appendChild(shadowHost)
  }
  reparent()
  document.addEventListener("fullscreenchange", reparent)
  return () => document.removeEventListener("fullscreenchange", reparent)
}

// Tracked by reference: the host moves with fullscreen, and a detached one has no id lookup.
let mountedSidebar: { host: HTMLElement; stopFollowing: () => void } | null = null

export function mountSubtitlesSidebar(adapter: SubtitlesProvidersAdapter): void {
  if (!adapter.supportsSidebar) return
  if (mountedSidebar) return
  // Left by a dead instance of this script, e.g. after Firefox injects into open tabs on update.
  const staleHost = document.getElementById(SUBTITLES_SIDEBAR_HOST_ID)
  if (staleHost) removeReactShadowHost(staleHost)

  const shadowHost = createReactShadowHost(
    <SubtitlesProviders adapter={adapter}>
      <SubtitlesSidebar />
    </SubtitlesProviders>,
    {
      position: "block",
      inheritStyles: false,
      cssContent: [themeCSS],
      forcedTheme: SUBTITLES_THEME,
      style: { height: "100%" },
    },
  )

  shadowHost.id = SUBTITLES_SIDEBAR_HOST_ID
  Object.assign(shadowHost.style, {
    transition: "none",
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483000",
  })
  // An already-open shell may have restored its geometry during flushSync.
  if (!shadowHost.style.left) applySidebarRect(shadowHost, defaultSidebarRect(sidebarViewport()))

  mountedSidebar = { host: shadowHost, stopFollowing: followFullscreen(shadowHost) }
}

/** The sidebar is bound to one adapter; a page that swaps adapters unmounts it and mounts anew. */
export function unmountSubtitlesSidebar(): void {
  const host = mountedSidebar?.host ?? document.getElementById(SUBTITLES_SIDEBAR_HOST_ID)
  mountedSidebar?.stopFollowing()
  mountedSidebar = null
  if (host) removeReactShadowHost(host)
}
