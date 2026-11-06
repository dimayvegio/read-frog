// Frozen v122 snapshot. Microsoft remains selected; all saved voice mappings and
// speech controls survive. Reapplying this step preserves the new user's choice.
export function migrate(config: any): any {
  const tts = config.tts ?? {}
  return {
    ...config,
    tts: {
      ...tts,
      provider: tts.provider ?? "microsoft",
      openai: tts.openai ?? {
        model: "gpt-realtime-2.1-mini",
        voice: "marin",
        speed: 1,
        instructions: "",
      },
    },
  }
}
