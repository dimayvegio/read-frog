/**
 * Frozen v123 snapshot: add the 1.58 caption platforms without changing any
 * existing provider, private credential, TTS, or translate-on-open choice.
 * Upstream uses v120 -> v121 for this; the fork already published v121/v122.
 */
export function migrate(config: any): any {
  const autoStart = config?.videoSubtitles?.autoStart
  if (!autoStart || typeof autoStart !== "object" || Array.isArray(autoStart)) return config
  return {
    ...config,
    videoSubtitles: {
      ...config.videoSubtitles,
      autoStart: { bilibili: false, udemy: false, edx: false, ...autoStart },
    },
  }
}
