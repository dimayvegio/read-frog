import type { Browser } from "wxt/browser"
import { browser } from "#imports"
import { LiveTranslationController } from "@/utils/audio-transcription/live-translation"
import { MAX_TRANSCRIPT } from "@/utils/audio-transcription/schema"
import {
  sourceActionSchema,
  liveTranscriptSourceURL,
  sourceViewSchema,
  liveTranslationCommand,
  type SourceView,
  type SourceSnapshot,
} from "@/utils/audio-transcription/source-view"
import { onMessage, sendMessage } from "@/utils/message"
import { isTrustedOptionsSender } from "./settings-sender"
import { createLiveTranslator } from "./tab-audio-translation"

let scope: {
  source: number
  owner: number
  url: string
  view: SourceView
  translator: LiveTranslationController
} | null = null
let revision = 0
const snapshot = (): SourceSnapshot => ({
  revision,
  view: scope ? { ...scope.view, translation: scope.translator.snapshot } : null,
})
function notify(source: number) {
  revision++
  // No transcript is broadcast to other tabs or subframes.
  void sendMessage("tabAudioViewChanged", snapshot(), { tabId: source, frameId: 0 }).catch(() => {})
}
function ownsSource(sender: Browser.runtime.MessageSender) {
  return (
    sender.id === browser.runtime.id &&
    sender.frameId === 0 &&
    scope !== null &&
    liveTranscriptSourceURL(sender.url) === scope.url &&
    scope?.source === sender.tab?.id
  )
}
function ownsAudio(sender: Browser.runtime.MessageSender) {
  return (
    isTrustedOptionsSender(
      sender,
      browser.runtime.id,
      browser.runtime.getURL("/audio-transcription.html"),
    ) && scope?.owner === sender.tab?.id
  )
}
export function clearTabAudioView(tabId?: number) {
  if (!scope || (tabId !== undefined && scope.source !== tabId && scope.owner !== tabId)) return
  const source = scope.source
  scope.translator.dispose()
  scope = null
  notify(source)
}
export function beginTabAudioView(
  session: string,
  source: number,
  owner: number,
  sourceURL: string | null,
) {
  clearTabAudioView()
  const url = liveTranscriptSourceURL(sourceURL ?? undefined)
  if (!url) return
  const translator = new LiveTranslationController(createLiveTranslator(), (translation) => {
    if (scope?.view.session !== session) return
    scope.view.translation = translation
    notify(scope.source)
  })
  scope = {
    source,
    owner,
    url,
    translator,
    view: {
      session,
      status: "connecting",
      text: "",
      pending: "",
      message: "Đang kết nối chép lời…",
      translation: translator.snapshot,
    },
  }
  notify(source)
}
export function stoppingTabAudioView(session: string) {
  if (!scope || scope.view.session !== session || scope.view.status === "stopped") return
  scope.view.status = "stopping"
  notify(scope.source)
}
export function finishTabAudioView(session: string) {
  if (!scope || scope.view.session !== session || scope.view.status === "stopped") return
  scope.view = {
    ...scope.view,
    status: "stopped",
    message: "Đã dừng. Phần chưa chốt được giữ là bản nháp.",
  }
  notify(scope.source)
}
export function receiveTabAudioViewNotice(raw: unknown, sender: Browser.runtime.MessageSender) {
  if (
    !isTrustedOptionsSender(
      sender,
      browser.runtime.id,
      browser.runtime.getURL("/offscreen.html"),
    ) ||
    !scope ||
    !raw ||
    typeof raw !== "object"
  )
    return
  const value = raw as Record<string, unknown>
  if (value.target !== "read-frog-tab-audio-notice" || value.session !== scope.view.session) return
  let next: unknown
  if (value.type === "started")
    next = { ...scope.view, status: "listening", message: "Đang chép lời trực tiếp" }
  else if (value.type === "text") {
    if (
      typeof value.text !== "string" ||
      typeof value.pending !== "string" ||
      value.text.length + value.pending.length > MAX_TRANSCRIPT
    )
      return
    next = { ...scope.view, text: value.text.slice(-16000), pending: value.pending.slice(-4000) }
  } else if (value.type === "stopped")
    next = { ...scope.view, status: "stopped", message: value.message }
  else return // Recording blob URLs never enter the source view.
  const parsed = sourceViewSchema.safeParse(next)
  if (!parsed.success) return
  scope.view = parsed.data
  if (value.type === "text") scope.translator.update(value.text as string)
  notify(scope.source)
}
export function setupTabAudioViewHandlers(
  stop: (session: string, source: number) => Promise<boolean>,
) {
  browser.runtime.onMessage.addListener((raw, sender) => {
    receiveTabAudioViewNotice(raw, sender)
    return undefined
  })
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.config) scope?.translator.invalidate()
  })
  onMessage("getTabAudioView", (message) =>
    ownsSource(message.sender) ? snapshot() : { revision: 0, view: null },
  )
  onMessage("setTabAudioTranslation", (message) => {
    const data = liveTranslationCommand.parse(message.data)
    if (!ownsSource(message.sender) || !scope || data.session !== scope.view.session)
      throw new Error("Invalid live translation source")
    scope.translator.configure(data.enabled, data.target, data.retry)
    return snapshot()
  })
  onMessage("tabAudioViewAction", async (message) => {
    const data = sourceActionSchema.parse(message.data)
    if (!scope || data.session !== scope.view.session) return false
    if (data.action === "video") {
      if (!ownsAudio(message.sender)) throw new Error("Invalid audio view owner")
    } else if (!ownsSource(message.sender)) throw new Error("Invalid source view sender")
    if (data.action === "stop") return stop(data.session, scope.source)
    const tab = await browser.tabs
      .get(data.action === "video" ? scope.source : scope.owner)
      .catch(() => null)
    if (tab?.id === undefined) return false
    await browser.tabs.update(tab.id, { active: true })
    await browser.windows.update(tab.windowId, { focused: true })
    return true
  })
}
