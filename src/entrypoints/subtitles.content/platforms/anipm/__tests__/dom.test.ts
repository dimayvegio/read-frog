// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { getAniPmConfig } from "../config"
import { createAniPmVideoIdentity, isAniPmPlayerFrame } from "../dom"

const observedFrame = {
  origin: "https://embed.settlar.io",
  pathname: "/embed/v1",
  embedded: true,
  ancestors: ["https://ani.pm"],
}

afterEach(() => document.body.replaceChildren())

describe("ani.pm observed player ownership", () => {
  it("accepts only the direct ani.pm Settlar iframe", () => {
    expect(isAniPmPlayerFrame(observedFrame)).toBe(true)
  })

  it.each([
    { origin: "https://embed.settlar.io.evil.invalid" },
    { origin: "http://embed.settlar.io" },
    { pathname: "/embed/v10" },
    { pathname: "/embed/v1/other" },
    { embedded: false },
    { ancestors: [] },
    { ancestors: ["https://ani.pm.evil.invalid"] },
    { ancestors: ["https://foreign.invalid/?ani.pm"] },
    { ancestors: ["https://ani.pm", "https://foreign.invalid"] },
  ])("rejects unowned players: %j", (override) => {
    expect(isAniPmPlayerFrame({ ...observedFrame, ...override })).toBe(false)
  })

  it("replaces local identities when the element or source changes, without exposing URLs", () => {
    const identify = createAniPmVideoIdentity()
    const video = document.createElement("video")
    expect(identify(video)).toBeNull()
    Object.defineProperty(video, "currentSrc", {
      value: "blob:private-source-one",
      configurable: true,
    })
    const first = identify(video)
    expect(first).toBe("anipm-1")
    expect(identify(video)).toBe(first)
    Object.defineProperty(video, "currentSrc", { value: "blob:private-source-two" })
    expect(identify(video)).toBe("anipm-2")
    const replacement = document.createElement("video")
    Object.defineProperty(replacement, "currentSrc", { value: "blob:private-source-two" })
    expect(identify(replacement)).toBe("anipm-3")
  })

  it("scopes native captions, controls and fullscreen overlay to the observed player", () => {
    document.body.innerHTML = `<div class="settlar-player"><video></video>
      <div class="media-controls" data-visible data-interactive="true">
        <div class="media-overflow"><button class="media-button--captions"></button></div>
      </div><div class="vjs-own-caps__win"><span class="vjs-own-caps__text"></span></div>
    </div>`
    const config = getAniPmConfig()
    const player = document.querySelector<HTMLElement>(config.selectors.playerContainer)!
    expect(document.querySelector(config.selectors.video)).toBeInstanceOf(HTMLVideoElement)
    expect(document.querySelector(config.selectors.nativeSubtitles!)).not.toBeNull()
    expect(config.controls!.checkVisibility(player)).toBe(true)
    player.querySelector(".media-controls")!.removeAttribute("data-visible")
    expect(config.controls!.checkVisibility(player)).toBe(false)
    expect(config.embedded).toBe(false)
    expect(config.getVideoPageUrl!()).toBe("https://ani.pm")
    expect(config.noSubtitlesMessage).toContain("SOFT")
    expect(config.noSubtitlesMessage).toContain("HARD")
  })
})
