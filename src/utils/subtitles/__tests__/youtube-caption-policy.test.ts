import { describe, expect, it } from "vitest"
import { isYoutubeCaptionUrl } from "../fetchers/youtube/url-builder"

describe("YouTube caption resource policy", () => {
  it("allows signed native timedtext resources", () => {
    expect(
      isYoutubeCaptionUrl("https://www.youtube.com/api/timedtext?v=video&lang=en&pot=fixture"),
    ).toBe(true)
  })
  it.each([
    "http://www.youtube.com/api/timedtext",
    "https://www.youtube.com.evil.invalid/api/timedtext",
    "https://user@www.youtube.com/api/timedtext",
    "https://www.youtube.com:8443/api/timedtext",
    "https://www.youtube.com/api/player",
    "https://www.youtube.com/api/timedtext#fragment",
    "https://api.openai.com/v1/responses",
    "not-a-url",
  ])("rejects other resources", (url) => expect(isYoutubeCaptionUrl(url)).toBe(false))
})
