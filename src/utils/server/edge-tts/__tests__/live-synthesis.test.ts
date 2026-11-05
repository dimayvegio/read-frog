import { expect, it, vi } from "vitest"
import { synthesizeEdgeTTSChunkWithRetry } from "../synthesize"

// Explicit opt-in; never part of normal offline unit validation.
it.runIf(process.env.READ_FROG_LIVE_TTS === "1")(
  "synthesizes a nonsensitive sample through Microsoft",
  async () => {
    const originalFetch = globalThis.fetch
    const destinations: string[] = []
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      destinations.push(url.hostname)
      return originalFetch(input, { ...init, signal: AbortSignal.timeout(8000) })
    })
    try {
      const result = await synthesizeEdgeTTSChunkWithRetry({
        text: "Hello. This is a Read Frog speech test.",
        voice: "en-US-AriaNeural",
        rate: "+0%",
        pitch: "+0Hz",
        volume: "+0%",
      })
      expect(result.audio.byteLength).toBeGreaterThan(1000)
      expect(result.contentType).toMatch(/^audio\//)
      expect(destinations).toContain("dev.microsofttranslator.com")
      expect(
        destinations.every(
          (host) =>
            host === "dev.microsofttranslator.com" ||
            /^[a-z0-9-]+\.tts\.speech\.microsoft\.com$/.test(host),
        ),
      ).toBe(true)
    } finally {
      fetchSpy.mockRestore()
    }
  },
  45000,
)
