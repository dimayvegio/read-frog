import type { PlatformConfig } from ".."
import { DEFAULT_CONTROLS_HEIGHT } from "@/utils/constants/subtitles"
import { ANI_PM_CONTROLS_SELECTOR, ANI_PM_PLAYER_SELECTOR, createAniPmVideoIdentity } from "./dom"

export function getAniPmConfig(): PlatformConfig {
  const identifyVideo = createAniPmVideoIdentity()
  return {
    platform: "anipm",
    // Settlar scales/stacks its control bar below Skip Intro. Keep the menu in
    // our player overlay, so it stays full-sized and clickable above that button.
    embedded: false,
    supportsSidebar: true,
    closeSettingsOnEnable: true,
    selectors: {
      video: `${ANI_PM_PLAYER_SELECTOR} video`,
      playerContainer: ANI_PM_PLAYER_SELECTOR,
      nativeSubtitles: `${ANI_PM_PLAYER_SELECTOR} .vjs-own-caps__win`,
    },
    events: {},
    controls: {
      findVideoContainer: () => document.querySelector(ANI_PM_PLAYER_SELECTOR),
      measureHeight: (container) =>
        container.querySelector(ANI_PM_CONTROLS_SELECTOR)?.getBoundingClientRect().height ??
        DEFAULT_CONTROLS_HEIGHT,
      checkVisibility: (container) => {
        const controls = container.querySelector(ANI_PM_CONTROLS_SELECTOR)
        return (
          !!controls?.hasAttribute("data-visible") &&
          controls.getAttribute("data-interactive") !== "false"
        )
      },
      observe: {
        attributes: true,
        attributeFilter: ["data-visible", "data-interactive"],
        subtree: true,
      },
    },
    getVideoId: () => identifyVideo(document.querySelector(`${ANI_PM_PLAYER_SELECTOR} video`)),
    getVideoPageUrl: () => "https://ani.pm",
  }
}
