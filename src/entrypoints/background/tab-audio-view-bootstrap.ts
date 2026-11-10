import { browser } from "#imports"
import {
  liveTranscriptSourceURL,
  type SourceViewResult,
} from "@/utils/audio-transcription/source-view"
import { sendMessage } from "@/utils/message"

/** One injection in flight per owned session. Retrying the view never retries ASR. */
export class SourceViewBootstrap {
  private pending: Promise<SourceViewResult> | undefined
  constructor(
    private source: number,
    private url: string,
    private alive: () => boolean,
  ) {}
  async open(): Promise<SourceViewResult> {
    if (!this.alive()) return { ok: false, reason: "UI-SOURCE-CHANGED" }
    const job = (this.pending ??= this.inject().finally(() => {
      if (this.pending === job) this.pending = undefined
    }))
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        job,
        new Promise<SourceViewResult>((resolve) => {
          timer = setTimeout(() => resolve({ ok: false, reason: "UI-LOAD-TIMEOUT" }), 3000)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }
  private async inject(): Promise<SourceViewResult> {
    try {
      const frame = await browser.webNavigation.getFrame({ tabId: this.source, frameId: 0 })
      if (!this.alive() || !frame || liveTranscriptSourceURL(frame.url) !== this.url)
        return { ok: false, reason: "UI-SOURCE-CHANGED" }
      const target = frame.documentId
        ? { tabId: this.source, documentIds: [frame.documentId] }
        : { tabId: this.source, frameIds: [0] }
      await browser.scripting.executeScript({
        target,
        world: "ISOLATED",
        files: ["/live-transcript-view.js"],
      })
      if (!this.alive()) return { ok: false, reason: "UI-SOURCE-CHANGED" }
      const ready = await sendMessage("renderTabAudioSourcePane", undefined, {
        tabId: this.source,
        frameId: 0,
      })
      if (!this.alive()) return { ok: false, reason: "UI-SOURCE-CHANGED" }
      return ready ? { ok: true } : { ok: false, reason: "UI-LOAD-FAILED" }
    } catch {
      return { ok: false, reason: "UI-LOAD-FAILED" }
    }
  }
}
