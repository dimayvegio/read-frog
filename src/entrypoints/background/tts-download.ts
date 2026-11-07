import { browser } from "#imports"
import { onMessage } from "@/utils/message"
import { isMp3 } from "@/utils/vocabulary/audio"

const MAX_MP3_BYTES = 32 * 1024 * 1024

export async function downloadTTSMp3(data: { audioBase64: string }, senderId?: string) {
  if (senderId !== browser.runtime.id) throw new Error("Invalid speech download sender")
  const encoded = data?.audioBase64
  if (
    typeof encoded !== "string" ||
    !encoded.length ||
    encoded.length > Math.ceil(MAX_MP3_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    throw new Error("Invalid speech download")
  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
  } catch {
    throw new Error("Invalid speech download")
  }
  if (bytes.length > MAX_MP3_BYTES || !isMp3(bytes)) throw new Error("Invalid MP3 audio")
  const filename = `ReadFrog-OpenAI-TTS-${new Date().toISOString().replace(/[:.]/g, "-")}.mp3`
  try {
    await browser.downloads.download({
      url: `data:audio/mpeg;base64,${encoded}`,
      filename,
      saveAs: true,
      conflictAction: "uniquify",
    })
    return { saved: true }
  } catch (error) {
    if (error instanceof Error && /cancel/i.test(error.message)) return { saved: false }
    // oxlint-disable-next-line eslint/preserve-caught-error -- Do not serialize download internals or data URIs across the message boundary.
    throw new Error("Unable to save MP3 audio")
  }
}

export function setupTTSDownloadHandlers() {
  onMessage("downloadOpenAITTSMp3", (message) => downloadTTSMp3(message.data, message.sender.id))
}
