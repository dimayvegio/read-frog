import type { TestSeriesObject } from "./types"
import { testSeries as legacy } from "./v125"
export const testSeries: TestSeriesObject = Object.fromEntries(
  Object.entries(legacy).map(([id, item]) => [
    id,
    {
      description: "CSS selector compatibility; existing fixture CSS is unchanged",
      config: structuredClone(item.config),
    },
  ]),
)
