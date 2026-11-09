import type { Browser } from "wxt/browser"
import { browser } from "#imports"
import { readTranscriptionResponse } from "@/utils/audio-transcription/response"
import {
  AUDIO_CHUNK,
  decodeAudioChunk,
  formats,
  startSchema,
  validateAudioHeader,
  type TranscriptionStart,
  type TranscriptionMessage,
} from "@/utils/audio-transcription/schema"
import { TRANSCRIPTION_MODEL } from "@/utils/audio-transcription/schema"
import { onMessage } from "@/utils/message"
import { ensureInitializedConfig } from "./config"
import { readOpenAIExecutionCredential, readOpenAIKeyStatus } from "./openai-credentials"
import { isTrustedOptionsSender } from "./settings-sender"
import { openTranscriptionPage } from "./tab-audio"
import { beginUsage } from "./usage"

const pageURL = () => browser.runtime.getURL("/audio-transcription.html")
export function trustedTranscription(sender: Browser.runtime.MessageSender | undefined) {
  return isTrustedOptionsSender(sender, browser.runtime.id, pageURL())
}
export function setupTranscriptionHandlers() {
  onMessage("openAudioTranscription", async (message) => {
    await openTranscriptionPage(message.sender)
  })
}
class TranscriptionError extends Error {}
const error = (message: string) => new TranscriptionError(message)
let active = 0
export async function executeTranscription(
  metadata: TranscriptionStart,
  parts: Uint8Array<ArrayBuffer>[],
  revision: number,
  signal: AbortSignal,
  onText: (text: string) => void,
) {
  signal.throwIfAborted()
  const credential = await readOpenAIExecutionCredential()
  if (credential.revision !== revision)
    throw error("Khóa OpenAI đã đổi. Hãy bấm chuyển lại với cấu hình mới.")
  const body = new FormData()
  // File bytes are uploaded as chosen; do not append the original filename/path.
  body.append(
    "file",
    new Blob(parts, { type: formats[metadata.format] }),
    `audio.${metadata.format}`,
  )
  parts.length = 0
  body.append("model", TRANSCRIPTION_MODEL)
  body.append("response_format", "json")
  body.append("stream", "true")
  for (const code of metadata.languages) body.append("languages[]", code)
  if (metadata.prompt) body.append("prompt", metadata.prompt)
  const span = await beginUsage("other", TRANSCRIPTION_MODEL)
  try {
    signal.throwIfAborted()
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      body,
      headers: { Authorization: `Bearer ${credential.apiKey}` },
      credentials: "omit",
      redirect: "error",
      signal,
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw error(
        response.status === 401 || response.status === 403
          ? "OpenAI từ chối khóa hoặc quyền dùng gpt-transcribe. Kiểm tra OpenAI Settings."
          : response.status === 429
            ? "OpenAI giới hạn yêu cầu hoặc hết hạn mức. Kiểm tra tài khoản rồi thử lại."
            : response.status === 400 || response.status === 413 || response.status === 415
              ? "OpenAI chưa nhận được định dạng, dung lượng hoặc mã ngôn ngữ này. Kiểm tra file và gợi ý ngôn ngữ; không tự gửi lại."
              : `OpenAI chưa chép lời được (HTTP ${response.status}). Bạn có thể thử lại.`,
      )
    }
    let parsed
    try {
      parsed = await readTranscriptionResponse(response, signal, onText)
    } catch (issue) {
      if (signal.aborted) throw issue
      throw error(
        "Luồng chép lời chưa hoàn tất hoặc vượt giới hạn. Phần đang hiện chỉ là bản nháp; có thể thử lại.",
      )
    }
    const usage = parsed.usage
    await span.finish("complete", {
      input: usage?.type === "tokens" ? usage.input_tokens : null,
      output: usage?.type === "tokens" ? usage.output_tokens : null,
      audioMs: parsed.result.seconds === null ? null : parsed.result.seconds * 1000,
    })
    signal.throwIfAborted()
    const current = await readOpenAIKeyStatus()
    signal.throwIfAborted()
    if (!current.configured || current.revision !== revision)
      throw error("Khóa OpenAI đã đổi trong lượt xử lý. Chưa nhận kết quả cuối; hãy thử lại.")
    return parsed.result
  } catch (issue) {
    await span.finish(signal.aborted ? "cancelled" : "error")
    throw issue
  }
}

/** Stop-and-wait chunks keep the 25 MB upload below browser message-size limits. */
export function handleTranscriptionPort(port: Browser.runtime.Port) {
  if (!trustedTranscription(port.sender)) {
    port.disconnect()
    return
  }
  const controller = new AbortController()
  let closed = false,
    claimed = false,
    metadata: TranscriptionStart | null = null,
    revision = -1,
    phase: "idle" | "starting" | "receiving" | "processing" = "idle"
  let loaded = 0,
    next = 0,
    parts: Uint8Array<ArrayBuffer>[] = [],
    timer: ReturnType<typeof setTimeout> | undefined
  type Outgoing = TranscriptionMessage extends infer M
    ? M extends { id: string }
      ? Omit<M, "id">
      : never
    : never
  const post = (value: Outgoing) => {
    if (!closed && metadata) {
      try {
        port.postMessage({ ...value, id: metadata.id })
      } catch {
        cleanup()
      }
    }
  }
  const cleanup = () => {
    if (closed) return
    closed = true
    controller.abort()
    if (timer) clearTimeout(timer)
    parts = []
    if (claimed) {
      active--
      claimed = false
    }
    port.onMessage.removeListener(receive)
    port.onDisconnect.removeListener(cleanup)
    try {
      port.disconnect()
    } catch {
      /* Already disconnected. */
    }
  }
  const fail = (message: string) => {
    post({ type: "error", message })
    cleanup()
  }
  const timeout = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fail("Chuẩn bị file quá lâu. Hãy mở lại lượt chuyển."), 30000)
  }
  const receive = async (raw: unknown) => {
    if (closed) return
    const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
    if (data?.type === "ping") return
    try {
      if (phase === "idle") {
        const parsed = startSchema.safeParse(raw)
        if (!parsed.success) {
          cleanup()
          return
        }
        metadata = parsed.data
        phase = "starting"
        if (active >= 2)
          throw error("Đang có hai file được xử lý. Chờ một lượt hoàn tất rồi thử lại.")
        active++
        claimed = true
        timeout()
        await ensureInitializedConfig()
        const status = await readOpenAIKeyStatus()
        if (closed) return
        if (!status.configured)
          throw error("Cần lưu khóa OpenAI trong OpenAI Settings trước khi chuyển file.")
        revision = status.revision
        phase = "receiving"
        timeout()
        post({ type: "ack", index: -1, loaded: 0 })
        return
      }
      if (phase !== "receiving" || !metadata) throw error("Thứ tự truyền file không hợp lệ.")
      if (data?.type === "chunk") {
        if (data.index !== next || loaded >= metadata.size)
          throw error("Thứ tự hoặc dung lượng file không hợp lệ.")
        const bytes = decodeAudioChunk(data.data)
        if (bytes.length !== Math.min(AUDIO_CHUNK, metadata.size - loaded))
          throw error("Dung lượng gói âm thanh không hợp lệ.")
        if (!loaded) validateAudioHeader(bytes, metadata.format)
        parts.push(bytes)
        loaded += bytes.length
        timeout()
        post({ type: "ack", index: next++, loaded })
        return
      }
      if (data?.type !== "commit" || loaded !== metadata.size)
        throw error("File chưa được truyền đủ; chưa gửi tới OpenAI.")
      phase = "processing"
      if (timer) clearTimeout(timer)
      post({ type: "processing" })
      let last = 0
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15 * 60 * 1000)])
      const result = await executeTranscription(metadata, parts, revision, signal, (text) => {
        if (performance.now() - last >= 100) {
          last = performance.now()
          post({ type: "text", text })
        }
      })
      if (!closed && !signal.aborted) post({ type: "done", result })
      cleanup()
    } catch (issue) {
      if (!closed)
        fail(
          issue instanceof TranscriptionError
            ? issue.message
            : "Không xử lý được file âm thanh. Kiểm tra file hoặc kết nối rồi thử lại.",
        )
    }
  }
  port.onMessage.addListener(receive)
  port.onDisconnect.addListener(cleanup)
  timeout()
}
