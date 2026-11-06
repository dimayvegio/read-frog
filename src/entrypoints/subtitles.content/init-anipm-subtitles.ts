import type { ContentScriptContext } from "#imports"
import { TextTrackFetcher } from "@/utils/subtitles/fetchers/text-track"
import { getAniPmConfig } from "./platforms/anipm/config"
import { isAniPmPlayerFrame } from "./platforms/anipm/dom"
import {
  mountAniPmTranslateButton,
  removeAniPmTranslateButton,
} from "./platforms/anipm/translate-button"
import { pollPlayerSubtitles } from "./poll-player-subtitles"
import { unmountSubtitlesUI } from "./renderer/mount-subtitles-ui"
import { UniversalVideoAdapter } from "./universal-adapter"

export function initAniPmSubtitles(ctx: ContentScriptContext) {
  if (
    !isAniPmPlayerFrame({
      origin: location.origin,
      pathname: location.pathname,
      embedded: window.self !== window.top,
      ancestors: Array.from(location.ancestorOrigins ?? []),
    })
  )
    return

  const config = getAniPmConfig()
  const adapter = new UniversalVideoAdapter({
    config,
    fetchers: {
      native: () =>
        new TextTrackFetcher({
          resolveVideo: () => document.querySelector(config.selectors.video),
          getVideoId: () => config.getVideoId?.() ?? null,
          allowTrackActivation: false,
          manageNativeTrackModes: false,
        }),
    },
  })
  pollPlayerSubtitles(ctx, {
    adapter,
    config,
    onStay: () => {
      mountAniPmTranslateButton(adapter)
      void adapter.handleSourceTrackChanged()
    },
    onLeave: removeAniPmTranslateButton,
  })
  ctx.onInvalidated(() => {
    removeAniPmTranslateButton()
    adapter.destroy()
    unmountSubtitlesUI()
  })
}
