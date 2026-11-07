import { z } from "zod"
import { browser } from "#imports"
import { imageDataURLSchema, type CapturedImage } from "@/types/image-translation"
import { onMessage } from "@/utils/message"
import { isTrustedOptionsSender, type SettingsSender } from "./settings-sender"

export const IMAGE_CAPTURE_TTL = 5 * 60 * 1000
const MAX_CAPTURE_BYTES = 32 * 1024 * 1024
function requirePage(sender: SettingsSender, pages: string[]) {
  if (
    !pages.some((page) =>
      isTrustedOptionsSender(
        sender,
        browser.runtime.id,
        new URL(page, browser.runtime.getURL("/")).href,
      ),
    )
  )
    throw new Error("This operation requires the image translation page")
}
export function setupImageTranslationHandlers() {
  // Full screenshots stay in worker memory for a one-time handoff; never in
  // local/session storage, settings, exports, URLs or provider logs.
  const captures = new Map<string, CapturedImage>()
  const open = async (image?: string, windowId?: number) => {
    let channel = ""
    if (image) {
      if (
        image.length > MAX_CAPTURE_BYTES ||
        !(
          image.startsWith("data:image/png;base64,iVBORw0KGgo") ||
          image.startsWith("data:image/jpeg;base64,/9j/")
        )
      )
        throw new Error(
          "Ảnh chụp quá lớn hoặc không hợp lệ. Hãy dùng Win+Shift+S rồi dán một vùng nhỏ hơn.",
        )
      for (const [key, value] of captures)
        if (Date.now() - value.createdAt > IMAGE_CAPTURE_TTL) captures.delete(key)
      while (captures.size >= 2) captures.delete(captures.keys().next().value!)
      channel = crypto.randomUUID()
      captures.set(channel, { image, createdAt: Date.now() })
    }
    try {
      await browser.tabs.create({
        ...(windowId === undefined ? {} : { windowId }),
        url: new URL(
          `image-translate.html${channel ? `?capture=${channel}` : ""}`,
          browser.runtime.getURL("/"),
        ).href,
      })
    } catch (error) {
      captures.delete(channel)
      throw error
    }
  }
  onMessage("captureImageTranslation", async (message) => {
    requirePage(message.sender, ["popup.html"])
    const windowId = z.number().int().nonnegative().parse(message.data?.windowId)
    const [source] = await browser.tabs.query({ active: true, windowId })
    if (source?.id === undefined || source.id < 0) throw new Error("Không tìm được tab cần chụp.")
    let image: string
    try {
      image = await browser.tabs.captureVisibleTab(windowId, { format: "png" })
    } catch {
      throw new Error(
        "Edge chưa cho phép chụp tab này. Dùng Win+Shift+S rồi mở Dịch ảnh để dán bằng Ctrl+V.",
      )
    }
    const [current] = await browser.tabs.query({ active: true, windowId })
    if (current?.id !== source.id || current.url !== source.url)
      throw new Error("Tab đã thay đổi trong lúc chụp. Hãy chụp lại.")
    await open(image, windowId)
  })
  onMessage("openImageTranslation", async (message) => {
    requirePage(message.sender, ["popup.html", "pdf-reader.html", "sidepanel.html"])
    if (message.data?.image) {
      requirePage(message.sender, ["pdf-reader.html"])
      imageDataURLSchema.parse(message.data.image)
    }
    await open(message.data?.image)
  })
  onMessage("consumeCapturedImage", (message) => {
    requirePage(message.sender, ["image-translate.html"])
    const channel = z.uuid().parse(message.data?.channel)
    if (new URL(message.sender.url).searchParams.get("capture") !== channel)
      throw new Error("Invalid image channel")
    const value = captures.get(channel)
    captures.delete(channel)
    return value && Date.now() - value.createdAt <= IMAGE_CAPTURE_TTL ? value : null
  })
}
