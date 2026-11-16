import type { TestSeriesObject } from "./types"
import { testSeries as legacy } from "./v126"
export const testSeries: TestSeriesObject = Object.fromEntries(
  Object.entries(legacy).map(([id, item]) => {
    const config = structuredClone(item.config)
    config.pageTranslation.requestQueueConfig.timeoutMs = 20000
    config.videoSubtitles.requestQueueConfig.timeoutMs = 20000
    return [id, { description: "Queue timeout defaults preserve all existing settings", config }]
  }),
)
