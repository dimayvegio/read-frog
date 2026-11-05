import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { resolveSubtitlesProvider, fetchSubtitlesSummary } from "../translator"
const send = vi.hoisted(() => vi.fn<(...args: any[]) => any>())
vi.mock("@/utils/message", () => ({ sendMessage: send }))
describe("local subtitle text tasks", () => {
  it.each(["lineTranslation", "summary", "segmentation"] as const)(
    "resolves a public OpenAI snapshot for %s",
    async (task) => {
      expect(await resolveSubtitlesProvider(DEFAULT_CONFIG, task)).toMatchObject({
        status: "ok",
        ref: { kind: "local", config: DEFAULT_CONFIG.providersConfig[0] },
      })
    },
  )
  it("fails closed when a stale provider ID is supplied", async () => {
    expect(
      await resolveSubtitlesProvider(
        {
          ...DEFAULT_CONFIG,
          videoSubtitles: { ...DEFAULT_CONFIG.videoSubtitles, providerId: "removed" },
        },
        "summary",
      ),
    ).toEqual({ status: "none" })
  })
  it("does not request an optional summary when the caller passes null", async () => {
    expect(
      await fetchSubtitlesSummary(
        { videoTitle: "Title", subtitlesTextContent: "Text" },
        DEFAULT_CONFIG,
        null,
      ),
    ).toBeNull()
    expect(send).not.toHaveBeenCalled()
  })
})
