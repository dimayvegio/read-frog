import type { HotkeyChord } from "@tanstack/hotkeys"
import { HotkeyManager } from "@tanstack/hotkeys"
import { getLocalConfig } from "@/utils/config/storage"
import { sendMessage } from "@/utils/message"
import { isShortcutEmpty, isValidShortcut } from "@/utils/shortcut"

/**
 * Opens the Translation Hub from any page. A content script cannot create a
 * tab itself, so the background does it — a dedicated local navigation message.
 */
export async function bindTranslationHubShortcutKey() {
  const config = await getLocalConfig()
  if (!config || isShortcutEmpty(config.translationHub.shortcut)) {
    return () => {}
  }

  const shortcut = config.translationHub.shortcut
  if (!isValidShortcut(shortcut)) {
    return () => {}
  }

  const registration = HotkeyManager.getInstance().register(
    shortcut as HotkeyChord,
    () => {
      void sendMessage("openTranslationHub", undefined)
    },
    {
      ignoreInputs: true,
      preventDefault: true,
      stopPropagation: true,
    },
  )

  return () => {
    registration.unregister()
  }
}
