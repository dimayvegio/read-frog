import type { SubtitlesPlatform } from "@/types/config/subtitles"

export interface ControlsConfig {
  findVideoContainer?: () => HTMLElement | null
  measureHeight: (container: HTMLElement) => number
  checkVisibility: (container: HTMLElement) => boolean
  /** The change to recheck the controls on, for a player whose subtree churns, as with danmaku. */
  observe?: MutationObserverInit
}

export interface PlatformConfig {
  /** Which site's player this is; picks that site's translate-on-open switch. */
  platform: SubtitlesPlatform
  embedded?: boolean
  silentErrors?: boolean
  /** Runtime-only guidance when a native caption track is unavailable. */
  noSubtitlesMessage?: string
  containerShrinkRatio?: (container: HTMLElement) => number | null
  subtitlesZIndex?: number

  selectors: {
    video: string
    playerContainer: string
    controlsBar?: string
    nativeSubtitles?: string
  }

  events: {
    navigateStart?: string
    navigateFinish?: string
  }

  controls?: ControlsConfig

  /** Height of the translate button's box, for a controls row taller than the buttons it holds. */
  translateButtonHeight?: number

  supportsSidebar?: boolean

  /** Dismiss the player menu after the user turns subtitles on. */
  closeSettingsOnEnable?: boolean

  getVideoId?: () => string | null

  /**
   * A link to the video playing now, for a note saved from its subtitles.
   * Needed where the page URL does not name the video (a timeline, a reply's
   * video); without it the page URL is used.
   */
  getVideoPageUrl?: () => string | null

  isLiveContent?: () => Promise<boolean>

  /**
   * When true, the host player is showing an ad. Overlay captions for the main
   * video should be suppressed until the ad ends.
   */
  isAdPlaying?: (playerContainer: HTMLElement) => boolean
}
