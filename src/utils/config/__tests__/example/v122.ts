import type { TestSeriesObject } from "./types"
import { testSeries as v121 } from "./v121"

export const testSeries: TestSeriesObject = Object.fromEntries(
  Object.entries(v121).map(([id, entry]) => [
    id,
    {
      description: "Adds opt-in OpenAI TTS and preserves Microsoft voices",
      config: {
        ...structuredClone(entry.config),
        tts: {
          ...structuredClone(entry.config.tts),
          provider: "microsoft",
          openai: { model: "gpt-realtime-2.1-mini", voice: "marin", speed: 1, instructions: "" },
        },
      },
    },
  ]),
)
