/** Frozen v124 snapshot: ani.pm is opt-in; preserve every existing fork setting. */
export function migrate(config: any): any {
  const autoStart = config?.videoSubtitles?.autoStart
  if (!autoStart || typeof autoStart !== "object" || Array.isArray(autoStart)) return config
  return {
    ...config,
    videoSubtitles: {
      ...config.videoSubtitles,
      autoStart: { anipm: false, ...autoStart },
    },
  }
}
