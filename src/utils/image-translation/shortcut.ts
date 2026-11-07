import { browser } from "#imports"
import { IMAGE_CAPTURE_COMMAND } from "@/types/image-translation"
export async function imageShortcutLabel() {
  const commands = await browser.commands.getAll()
  return commands.find((command) => command.name === IMAGE_CAPTURE_COMMAND)?.shortcut || "Chưa gán"
}
export function openImageShortcuts() {
  return browser.tabs.create({
    url:
      import.meta.env.BROWSER === "edge"
        ? "edge://extensions/shortcuts"
        : "chrome://extensions/shortcuts",
  })
}
