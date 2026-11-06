import type { ContentScriptContext } from "#imports"
import { initBilibiliSubtitles } from "./init-bilibili-subtitles"
import { initEdxSubtitles } from "./init-edx-subtitles"
import { initUdemySubtitles } from "./init-udemy-subtitles"
import { initYoutubeSubtitles } from "./init-youtube-subtitles"

let hasBootstrappedSubtitlesRuntime = false

export function bootstrapSubtitlesRuntime(ctx: ContentScriptContext) {
  if (hasBootstrappedSubtitlesRuntime) {
    return
  }

  hasBootstrappedSubtitlesRuntime = true
  initYoutubeSubtitles(ctx)
  initBilibiliSubtitles(ctx)
  initUdemySubtitles(ctx)
  initEdxSubtitles(ctx)
}
