import { browser } from "#imports"
import { liveTranscriptSourceURL } from "@/utils/audio-transcription/source-view"
import { onMessage, sendMessage } from "@/utils/message"

/** Only load the floating React view when an explicit capture needs this page. */
export function setupLiveTranscriptLauncher() {
  if (window !== window.top || !liveTranscriptSourceURL(location.href)) return () => {}
  let disposed = false,
    cleanup: (() => void) | undefined,
    loading: Promise<boolean> | undefined
  const ensure = () => {
    loading ??= import("./index")
      .then(({ setupLiveTranscriptView }) => {
        if (disposed) return false
        cleanup = setupLiveTranscriptView()
        return true
      })
      .catch(() => {
        loading = undefined
        return false
      })
    return loading
  }
  const unsubscribe = onMessage("tabAudioViewAvailable", (message) => {
    if (
      message.sender.id !== browser.runtime.id ||
      message.sender.url !== browser.runtime.getURL("/background.js")
    )
      return false
    return ensure()
  })
  // Recover a still-owned view if the content runtime is replaced without navigation.
  void sendMessage("getTabAudioView", undefined)
    .then((snapshot) => {
      if (!disposed && snapshot.view) void ensure()
    })
    .catch(() => {})
  return () => {
    disposed = true
    unsubscribe()
    cleanup?.()
  }
}
