import type { TestSeriesObject } from "./types"
import { testSeries as v123 } from "./v123"

export const testSeries: TestSeriesObject = Object.fromEntries(
  Object.entries(v123).map(([id, entry]) => [
    id,
    {
      description: "Adds opt-in ani.pm native captions, preserving existing fork settings",
      config: {
        ...structuredClone(entry.config),
        videoSubtitles: {
          ...structuredClone(entry.config.videoSubtitles),
          autoStart: { anipm: false, ...entry.config.videoSubtitles.autoStart },
        },
      },
    },
  ]),
)
