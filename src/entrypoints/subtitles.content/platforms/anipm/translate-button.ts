import type { SubtitlesProvidersAdapter } from "../../universal-adapter"
import { removeReactShadowHost } from "@/utils/react-shadow-host/create-shadow-host"
import { isolatePlayerEvents } from "../../renderer/isolate-player-events"
import { renderSubtitlesTranslateButton } from "../../renderer/render-translate-button"
import { ANI_PM_CAPTIONS_BUTTON_SELECTOR } from "./dom"

let mountedButton: HTMLElement | null = null

export function mountAniPmTranslateButton(adapter: SubtitlesProvidersAdapter): void {
  const captionsControl = document.querySelector(ANI_PM_CAPTIONS_BUTTON_SELECTOR)
  if (!captionsControl || mountedButton?.nextElementSibling === captionsControl) return
  // Reparent the existing React host when the player rebuilds its row, retaining the menu.
  if (!mountedButton) {
    mountedButton = renderSubtitlesTranslateButton({ adapter, height: 40 })
    isolatePlayerEvents(mountedButton)
  }
  captionsControl.before(mountedButton)
}

export function removeAniPmTranslateButton(): void {
  if (!mountedButton) return
  removeReactShadowHost(mountedButton)
  mountedButton = null
}
