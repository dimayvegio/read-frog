import { ContentScriptContext, defineUnlistedScript, browser } from "#imports"
import { setupLiveTranscriptView } from "./content-runtime/side/components/live-transcript"

/** Explicitly injected isolated-world bundle; no page-side dynamic imports. */
export default defineUnlistedScript(() => {
  if (window !== window.top) return
  const holder = globalThis as typeof globalThis & {
    __READ_FROG_LIVE_VIEW__?: { version: string; dispose: () => void }
  }
  const version = browser.runtime.getManifest().version
  if (holder.__READ_FROG_LIVE_VIEW__?.version === version) return
  holder.__READ_FROG_LIVE_VIEW__?.dispose()
  const ctx = new ContentScriptContext("live-transcript-view")
  const dispose = setupLiveTranscriptView()
  const marker = { version, dispose }
  holder.__READ_FROG_LIVE_VIEW__ = marker
  ctx.onInvalidated(() => {
    dispose()
    if (holder.__READ_FROG_LIVE_VIEW__ === marker) delete holder.__READ_FROG_LIVE_VIEW__
  })
})
