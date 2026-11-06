import type { TestSeriesObject } from "./types"
import { testSeries as v122 } from "./v122"

export const testSeries: TestSeriesObject = Object.fromEntries(
  Object.entries(v122).map(([id, entry]) => [
    id,
    {
      description: "Adds Bilibili, Udemy and edX while preserving local fork settings",
      config: {
        ...structuredClone(entry.config),
        videoSubtitles: {
          ...structuredClone(entry.config.videoSubtitles),
          autoStart: {
            bilibili: false,
            udemy: false,
            edx: false,
            ...entry.config.videoSubtitles.autoStart,
          },
        },
      },
    },
  ]),
)
