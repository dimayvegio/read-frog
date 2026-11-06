export const ANI_PM_PLAYER_SELECTOR = ".settlar-player"
export const ANI_PM_CONTROLS_SELECTOR = ".media-controls"
export const ANI_PM_CAPTIONS_BUTTON_SELECTOR =
  ".settlar-player .media-overflow .media-button--captions"

/** Only the directly embedded player observed on ani.pm owns this adapter. */
export function isAniPmPlayerFrame({
  origin,
  pathname,
  embedded,
  ancestors,
}: {
  origin: string
  pathname: string
  embedded: boolean
  ancestors: readonly string[]
}): boolean {
  return (
    origin === "https://embed.settlar.io" &&
    pathname === "/embed/v1" &&
    embedded &&
    ancestors.length === 1 &&
    ancestors[0] === "https://ani.pm"
  )
}

/** Local identities only: signed iframe/track URLs never become cache keys or prompts. */
export function createAniPmVideoIdentity() {
  const videos = new WeakMap<HTMLVideoElement, { source: string; id: string }>()
  let sequence = 0
  return (video: HTMLVideoElement | null): string | null => {
    if (!video?.currentSrc) return null
    let entry = videos.get(video)
    if (!entry || entry.source !== video.currentSrc) {
      entry = { source: video.currentSrc, id: `anipm-${++sequence}` }
      videos.set(video, entry)
    }
    return entry.id
  }
}
