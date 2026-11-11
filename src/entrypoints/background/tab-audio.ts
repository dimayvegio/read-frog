import type { Browser } from "wxt/browser"
import { z } from "zod"
import { browser } from "#imports"
import { liveTranscriptSourceURL } from "@/utils/audio-transcription/source-view"
import {
  LIVE_TRANSCRIPTION_MODEL,
  tabCommand,
  type TabOptions,
} from "@/utils/audio-transcription/tab-schema"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { onMessage, sendMessage } from "@/utils/message"
import { ensureInitializedConfig } from "./config"
import { readOpenAIExecutionCredential, readOpenAIKeyStatus } from "./openai-credentials"
import { isTrustedOptionsSender } from "./settings-sender"
import {
  beginTabAudioView,
  clearTabAudioView,
  finishTabAudioView,
  setupTabAudioViewHandlers,
  stoppingTabAudioView,
} from "./tab-audio-view"
import { SourceViewBootstrap } from "./tab-audio-view-bootstrap"
import { prepareAudioOffscreen } from "./tts-playback"
import { beginUsage } from "./usage"

const pageURL = () => browser.runtime.getURL("/audio-transcription.html")
const offscreenURL = () => browser.runtime.getURL("/offscreen.html")
const channels = new Map<
  string,
  { source: number; owner: number; at: number; url: string | null }
>()
type Session = {
  id: string
  owner: number
  source: number
  revision: number
  controller: AbortController
  options: TabOptions
  offered: boolean
  span?: Awaited<ReturnType<typeof beginUsage>>
  view?: SourceViewBootstrap
}
let current: Session | null = null
const trusted = (sender: Browser.runtime.MessageSender, url: string) =>
  isTrustedOptionsSender(sender, browser.runtime.id, url)

export async function openTranscriptionPage(sender: Browser.runtime.MessageSender) {
  if (!trusted(sender, browser.runtime.getURL("/popup.html")))
    throw new Error("Invalid transcription launcher")
  const [source] = await browser.tabs.query({ active: true, currentWindow: true })
  for (const [key, value] of channels) if (Date.now() - value.at > 300000) channels.delete(key)
  const channel =
    source?.id !== undefined && /^(https?|file):/.test(source.url ?? "") ? getRandomUUID() : null
  const tab = await browser.tabs.create({
    url: pageURL() + (channel ? `?source=${channel}` : ""),
    active: true,
    ...(source?.windowId !== undefined ? { windowId: source.windowId } : {}),
  })
  if (channel && source?.id !== undefined && tab.id !== undefined) {
    if (channels.size >= 20) channels.delete(channels.keys().next().value!)
    channels.set(channel, {
      source: source.id,
      owner: tab.id,
      at: Date.now(),
      url: liveTranscriptSourceURL(source.url),
    })
  }
}

async function stop(session: Session, discard: boolean) {
  stoppingTabAudioView(session.id)
  session.controller.abort()
  await sendMessage("tabAudioStopOffscreen", { session: session.id, discard }).catch(() => {})
  await session.span?.finish(discard ? "cancelled" : "complete")
  finishTabAudioView(session.id)
  if (current === session) current = null
}

export function setupTabAudioHandlers() {
  setupTabAudioViewHandlers(async (id, source) => {
    if (!current || current.id !== id || current.source !== source) return false
    await stop(current, false)
    return true
  })
  onMessage("showTabAudioView", async (message) => {
    const data = z.strictObject({ session: z.string().uuid() }).parse(message.data)
    const selected = current
    if (
      !trusted(message.sender, pageURL()) ||
      !selected ||
      selected.owner !== message.sender.tab?.id ||
      selected.id !== data.session ||
      !selected.view
    )
      throw new Error("Invalid source view owner")
    const result = await selected.view.open()
    if (current !== selected || selected.controller.signal.aborted)
      return { ok: false, reason: "UI-SOURCE-CHANGED" }
    if (result.ok) {
      await sendMessage("tabAudioUseSourceView", { session: selected.id }).catch(() => {})
      if (current !== selected || selected.controller.signal.aborted)
        return { ok: false, reason: "UI-SOURCE-CHANGED" }
      await browser.tabs.update(selected.source, { active: true }).catch(() => {})
    }
    return result
  })
  onMessage("tabAudioControl", async (message) => {
    if (!trusted(message.sender, pageURL()) || message.sender.tab?.id === undefined)
      throw new Error("Invalid tab audio controller")
    const data = tabCommand.parse(message.data)
    if (data.command === "start") {
      if (current) throw new Error("Đang có một lượt thu tab. Hãy dừng lượt đó trước.")
      const channel = channels.get(data.channel)
      if (!channel || channel.owner !== message.sender.tab.id || Date.now() - channel.at > 300000)
        throw new Error(
          "Quyền chọn tab đã hết hạn. Mở popup Read Frog tại tab đang phát rồi chọn Audio → Văn bản.",
        )
      channels.delete(data.channel)
      const session: Session = {
        id: getRandomUUID(),
        owner: channel.owner,
        source: channel.source,
        revision: -1,
        controller: new AbortController(),
        options: { mode: data.mode, languages: data.languages, prompt: data.prompt },
        offered: false,
      }
      current = session
      try {
        beginTabAudioView(
          session.id,
          session.source,
          session.owner,
          data.mode === "live" ? channel.url : null,
        )
        if (data.mode === "live" && channel.url)
          session.view = new SourceViewBootstrap(
            session.source,
            channel.url,
            () => current === session && !session.controller.signal.aborted,
          )
        const viewResult = await session.view?.open()
        const sourceView = viewResult?.ok === true
        session.controller.signal.throwIfAborted()
        await ensureInitializedConfig()
        if (data.mode === "live") {
          const status = await readOpenAIKeyStatus()
          if (!status.configured)
            throw new Error("Lưu khóa OpenAI trong Settings trước khi chép lời trực tiếp.")
          session.revision = status.revision
        }
        session.controller.signal.throwIfAborted()
        await prepareAudioOffscreen()
        session.controller.signal.throwIfAborted()
        const capture = (
          globalThis as unknown as {
            chrome: {
              tabCapture?: {
                getMediaStreamId: (options: { targetTabId: number }) => Promise<string>
              }
            }
          }
        ).chrome.tabCapture
        if (!capture) throw new Error("Thu âm tab cần Edge/Chrome phiên bản 116 trở lên.")
        const streamId = await capture.getMediaStreamId({ targetTabId: session.source })
        session.controller.signal.throwIfAborted()
        await sendMessage("tabAudioStartOffscreen", {
          session: session.id,
          streamId,
          shortTurns: sourceView,
          ...session.options,
        })
        session.controller.signal.throwIfAborted()
        if (sourceView) await browser.tabs.update(session.source, { active: true }).catch(() => {})
        return {
          ok: true,
          session: session.id,
          sourceView,
          ...(viewResult && !viewResult.ok ? { viewError: viewResult.reason } : {}),
        }
      } catch {
        await stop(session, true)
        throw new Error(
          "Chưa thu được tab. Tại tab video đang phát, mở popup Read Frog → Audio → Văn bản rồi thử lại. Cần Edge/Chrome 116+ và tab cho phép thu âm.",
        )
      }
    }
    const session = current
    if (!session || session.owner !== message.sender.tab.id || session.id !== data.session)
      return { ok: false }
    if (data.command === "release")
      await sendMessage("tabAudioReleaseOffscreen", { session: session.id, url: data.url })
    else await stop(session, data.command === "cancel")
    return { ok: true }
  })
  onMessage("tabAudioOffer", async (message) => {
    const session = current
    if (
      !trusted(message.sender, offscreenURL()) ||
      !session ||
      session.offered ||
      session.revision < 0 ||
      message.data.session !== session.id ||
      typeof message.data.sdp !== "string" ||
      message.data.sdp.length > 65536 ||
      !message.data.sdp.startsWith("v=0")
    )
      throw new Error("Invalid audio offer")
    session.offered = true
    // The permanent key and the short-lived token both stay in the private runtime.
    const credential = await readOpenAIExecutionCredential()
    if (credential.revision !== session.revision) throw new Error("Khóa OpenAI đã đổi.")
    const signal = AbortSignal.any([session.controller.signal, AbortSignal.timeout(30000)])
    const options = session.options
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      signal,
      headers: { Authorization: `Bearer ${credential.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 60 },
        session: {
          type: "transcription",
          audio: {
            input: {
              transcription: {
                model: LIVE_TRANSCRIPTION_MODEL,
                ...(options.languages.length ? { languages: options.languages } : {}),
                ...(options.prompt ? { prompt: options.prompt } : {}),
              },
              turn_detection: null,
            },
          },
        },
      }),
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(
        "OpenAI chưa mở được phiên chép lời trực tiếp. Kiểm tra key, model và hạn mức.",
      )
    }
    const raw = await response.text()
    if (raw.length > 65536) throw new Error("Invalid realtime response")
    const token: unknown = JSON.parse(raw)
    const value = token && typeof token === "object" && "value" in token ? token.value : null
    if (typeof value !== "string" || value.length > 8192 || !value)
      throw new Error("Invalid realtime credential")
    signal.throwIfAborted()
    session.span = await beginUsage("other", LIVE_TRANSCRIPTION_MODEL)
    const answer = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      signal,
      headers: { Authorization: `Bearer ${value}`, "Content-Type": "application/sdp" },
      body: message.data.sdp,
    })
    if (!answer.ok) {
      await answer.body?.cancel()
      throw new Error("OpenAI chưa kết nối được luồng âm thanh.")
    }
    const sdp = await answer.text()
    if (sdp.length > 65536 || !sdp.startsWith("v=0")) throw new Error("Invalid SDP answer")
    const status = await readOpenAIKeyStatus()
    signal.throwIfAborted()
    if (!status.configured || status.revision !== session.revision)
      throw new Error("Khóa OpenAI đã đổi.")
    return sdp
  })
  onMessage("tabAudioAlive", async (message) => {
    const session = current
    if (!trusted(message.sender, offscreenURL()) || !session || session.id !== message.data.session)
      return false
    if (session.revision >= 0) {
      const status = await readOpenAIKeyStatus()
      if (!status.configured || status.revision !== session.revision) {
        void stop(session, true)
        return false
      }
    }
    return !session.controller.signal.aborted
  })
  onMessage("tabAudioEnded", async (message) => {
    if (trusted(message.sender, offscreenURL()) && current?.id === message.data.session) {
      const session = current
      await session.span?.finish(message.data.failed ? "error" : "complete")
      session.controller.abort()
      finishTabAudioView(session.id)
      if (current === session) current = null
    }
  })
  browser.tabs.onRemoved.addListener((id) => {
    clearTabAudioView(id)
    for (const [key, value] of channels)
      if (value.source === id || value.owner === id) channels.delete(key)
    if (current && (current.source === id || current.owner === id)) void stop(current, true)
  })
  browser.tabs.onUpdated.addListener((id, info) => {
    if (info.url || info.status === "loading") {
      clearTabAudioView(id)
      for (const [key, value] of channels) if (value.source === id) channels.delete(key)
    }
    if (
      current &&
      ((info.url && current.source === id) ||
        (info.status === "loading" && (current.owner === id || current.source === id)))
    )
      void stop(current, true)
  })
}
