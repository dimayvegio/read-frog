import type { Browser } from "wxt/browser"
import { z } from "zod"
import { browser } from "#imports"
import { OPENAI_TTS_VOICES } from "@/types/openai-tts"
import {
  smartRequestSchema,
  parseSmartProfile,
  smartInstructions,
  SMART_VIDEO_MODEL,
  SMART_AUDIO_LIMIT,
} from "@/utils/subtitles/dubbing/smart"
import {
  createStreamPortHandler,
  createStartMessageParser,
  BackgroundStreamError,
} from "./background-stream"
import { ensureInitializedConfig } from "./config"
import { readOpenAIExecutionCredential, readOpenAIKeyStatus } from "./openai-credentials"
import { beginUsage } from "./usage"
const fail = (message: string) => new BackgroundStreamError("smart-video", message)
const wire = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.literal("stop"),
        message: z.object({ content: z.string().max(200000) }),
      }),
    )
    .length(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
})
const activeTabs = new Set<number>()
export function handleSmartVideoPort(port: Browser.runtime.Port) {
  const sender = port.sender
  const tabId = sender?.tab?.id
  if (
    !trustedSmartVideoSender(sender) ||
    tabId === undefined ||
    !sender ||
    activeTabs.has(tabId) ||
    activeTabs.size >= 2
  ) {
    port.disconnect()
    return
  }
  const check = async (url: string, top?: string) => {
    const frame = await browser.webNavigation.getFrame({ tabId, frameId: sender.frameId ?? 0 })
    const tab = await browser.tabs.get(tabId)
    if (!frame || frame.url !== url || !tab.url || (top && tab.url !== top) || !allowedTop(tab.url))
      throw fail("Nguồn video đã đổi.")
    if (frame.documentId || sender.documentId) {
      if (!frame.documentId || !sender.documentId || frame.documentId !== sender.documentId)
        throw fail("Tài liệu video đã đổi.")
    } else if (sender.url !== frame.url) throw fail("Nguồn video đã đổi.")
    return tab.url
  }
  return createStreamPortHandler(async (input, options) => {
    const r = smartRequestSchema.parse(input),
      signal = AbortSignal.any([
        options.signal ?? new AbortController().signal,
        AbortSignal.timeout(240000),
      ])
    signal.throwIfAborted()
    const top = await check(r.sourceUrl)
    const initialKey = await readOpenAIKeyStatus()
    signal.throwIfAborted()
    if (activeTabs.has(tabId) || activeTabs.size >= 2)
      throw fail("Một phân tích khác đang chạy. Hãy đợi hoặc hủy trước.")
    activeTabs.add(tabId)
    const scopeAbort = new AbortController()
    let checking = false,
      closed = false
    const ownedCheck = async () => {
      await check(r.sourceUrl, top)
      const key = await readOpenAIKeyStatus()
      if (!key.configured || key.revision !== initialKey.revision) throw fail("Khóa OpenAI đã đổi.")
    }
    const timer = setInterval(() => {
      if (checking || closed || signal.aborted) return
      checking = true
      void ownedCheck()
        .catch(() => {
          if (!closed) scopeAbort.abort()
        })
        .finally(() => {
          checking = false
        })
    }, 1000)
    try {
      return await executeSmartVideo(r, AbortSignal.any([signal, scopeAbort.signal]), ownedCheck)
    } finally {
      closed = true
      clearInterval(timer)
      activeTabs.delete(tabId)
    }
  }, createStartMessageParser(smartRequestSchema))(port)
}
export async function executeSmartVideo(
  input: unknown,
  signal: AbortSignal,
  check: () => Promise<unknown>,
) {
  const r = smartRequestSchema.parse(input)
  await ensureInitializedConfig()
  const credential = await readOpenAIExecutionCredential()
  if (!credential.apiKey) throw fail("Chưa có khóa OpenAI.")
  let binary: string
  try {
    binary = atob(r.audio)
  } catch {
    throw fail("Audio không hợp lệ.")
  }
  if (
    binary.length > SMART_AUDIO_LIMIT ||
    !(
      (r.format === "wav" && binary.startsWith("RIFF") && binary.slice(8, 12) === "WAVE") ||
      (r.format === "mp3" &&
        (binary.startsWith("ID3") ||
          (binary.charCodeAt(0) === 255 && (binary.charCodeAt(1) & 224) === 224)))
    )
  )
    throw fail("Chỉ nhận audio MP3/WAV hợp lệ.")
  signal.throwIfAborted()
  await check()
  signal.throwIfAborted()
  const span = await beginUsage("other", SMART_VIDEO_MODEL)
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential.apiKey}` },
      body: JSON.stringify({
        model: SMART_VIDEO_MODEL,
        modalities: ["text"],
        store: false,
        temperature: 0,
        max_completion_tokens: 12000,
        messages: [
          { role: "system", content: smartInstructions },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  title: r.title,
                  target: r.target,
                  allowedVoices: OPENAI_TTS_VOICES,
                  captions: r.cues.map((c, i) => ({ i, ...c })),
                }),
              },
              { type: "input_audio", input_audio: { data: r.audio, format: r.format } },
            ],
          },
        ],
      }),
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw fail(`OpenAI chưa phân tích được (HTTP ${response.status}). Không tự thử lại tính phí.`)
    }
    if (!response.body) throw fail("OpenAI không trả kết quả.")
    const reader = response.body.getReader(),
      decoder = new TextDecoder()
    let size = 0,
      text = ""
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.length
        if (size > 512 * 1024) throw fail("Phân tích vượt giới hạn.")
        text += decoder.decode(value, { stream: true })
      }
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
    const result = wire.parse(JSON.parse(text + decoder.decode())),
      content = result.choices[0]!.message.content.trim()
        .replace(/^```(?:json)?\s*/u, "")
        .replace(/\s*```$/u, "")
    const profile = parseSmartProfile(JSON.parse(content), r.cues)
    signal.throwIfAborted()
    const status = await readOpenAIKeyStatus()
    if (!status.configured || status.revision !== credential.revision)
      throw fail("Khóa OpenAI đã đổi. Hủy phân tích cũ.")
    await check()
    signal.throwIfAborted()
    await span.finish("complete", {
      input: result.usage?.prompt_tokens ?? null,
      output: result.usage?.completion_tokens ?? null,
      audioMs: r.duration * 1000,
    })
    return profile
  } catch (error) {
    await span.finish(signal.aborted ? "cancelled" : "error")
    if (error instanceof BackgroundStreamError) throw error
    throw fail(
      "Phân tích audio chưa đủ chắc chắn hoặc không đúng mẫu. Chưa áp dụng; không tự thử lại.",
    )
  }
}
function allowedTop(url: string) {
  try {
    const u = new URL(url)
    return (
      u.protocol === "https:" &&
      (/(^|\.)youtube\.com$/u.test(u.hostname) || u.hostname === "ani.pm")
    )
  } catch {
    return false
  }
}
export function trustedSmartVideoSender(sender: Browser.runtime.MessageSender | undefined) {
  if (sender?.id !== browser.runtime.id || sender.tab?.id === undefined || !sender.url) return false
  try {
    const u = new URL(sender.url)
    return (
      u.protocol === "https:" &&
      (/(^|\.)youtube\.com$/u.test(u.hostname) ||
        u.hostname === "ani.pm" ||
        u.hostname.endsWith(".settlar.io"))
    )
  } catch {
    return false
  }
}
