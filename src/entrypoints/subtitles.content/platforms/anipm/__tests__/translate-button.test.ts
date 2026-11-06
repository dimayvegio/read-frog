// @vitest-environment jsdom
import type { SubtitlesProvidersAdapter } from "../../../universal-adapter"
import { afterEach, describe, expect, it, vi } from "vitest"
import { mountAniPmTranslateButton, removeAniPmTranslateButton } from "../translate-button"

const lifecycle = vi.hoisted(() => ({ created: 0, destroyed: 0 }))
vi.mock("../../../renderer/render-translate-button", () => ({
  renderSubtitlesTranslateButton: () => {
    lifecycle.created++
    const host = document.createElement("div")
    host.id = "read-frog-subtitles-translate-button-container"
    return host
  },
}))
vi.mock("@/utils/react-shadow-host/create-shadow-host", () => ({
  removeReactShadowHost: (host: HTMLElement) => {
    lifecycle.destroyed++
    host.remove()
  },
}))

afterEach(() => {
  removeAniPmTranslateButton()
  document.body.replaceChildren()
  lifecycle.created = lifecycle.destroyed = 0
})

describe("ani.pm controls lifecycle", () => {
  it("retains one React menu before CC across control-row replacement and releases it on leave", () => {
    const adapter = {} as SubtitlesProvidersAdapter
    document.body.innerHTML = `<div class="settlar-player"><div class="media-overflow"><button class="media-button--captions"></button></div></div>`
    mountAniPmTranslateButton(adapter)
    const host = document.getElementById("read-frog-subtitles-translate-button-container")!
    mountAniPmTranslateButton(adapter)
    document.querySelector(".media-overflow")!.innerHTML =
      `<button class="media-button--captions"></button>`
    mountAniPmTranslateButton(adapter)
    expect(document.getElementById(host.id)).toBe(host)
    expect(host.nextElementSibling?.matches(".media-button--captions")).toBe(true)
    expect(lifecycle.created).toBe(1)
    removeAniPmTranslateButton()
    expect(lifecycle.destroyed).toBe(1)
    expect(document.getElementById(host.id)).toBeNull()
  })
})
