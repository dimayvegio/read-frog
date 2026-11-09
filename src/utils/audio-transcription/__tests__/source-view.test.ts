import { expect, it } from "vitest"
import { liveTranscriptSourceURL } from "../source-view"

it("admits user-selected web/file sources but rejects internal documents, active URL schemes and credentials", () => {
  for (const url of [
    "http://localhost/video",
    "https://player.test/watch",
    "file:///C:/local.html",
  ])
    expect(liveTranscriptSourceURL(url)).toBe(url)
  for (const url of [
    undefined,
    "not a URL",
    "edge://extensions",
    "chrome://settings",
    "chrome-extension://abc/popup.html",
    "about:blank",
    "data:text/html,test",
    "javascript:alert(1)",
    "https://user:secret@player.test/video",
  ])
    expect(liveTranscriptSourceURL(url)).toBeNull()
})
