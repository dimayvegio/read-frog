import { browser } from "#imports"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import {
  AUDIO_CHUNK,
  audioFormat,
  encodeAudioChunk,
  startSchema,
  TRANSCRIPTION_PORT,
  type TranscriptionMessage,
  type TranscriptionOptions,
  type TranscriptionResult,
} from "./schema"

export async function transcribeAudioFile(
  file: File,
  options: TranscriptionOptions,
  signal: AbortSignal,
  progress: (value: { loaded?: number; processing?: boolean; text?: string }) => void,
): Promise<TranscriptionResult> {
  const metadata = startSchema.parse({
    type: "start",
    id: getRandomUUID(),
    format: audioFormat(file.name),
    size: file.size,
    ...options,
  })
  signal.throwIfAborted()
  const port = browser.runtime.connect({ name: TRANSCRIPTION_PORT })
  const acks = new Map<
    number,
    { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >()
  let closed = false,
    failure: Error | null = null
  let resolve!: (value: TranscriptionResult) => void, reject!: (error: Error) => void
  const result = new Promise<TranscriptionResult>((yes, no) => {
    resolve = yes
    reject = no
  })
  void result.catch(() => {})
  const cleanup = () => {
    if (closed) return
    closed = true
    signal.removeEventListener("abort", abort)
    port.onMessage.removeListener(message)
    port.onDisconnect.removeListener(disconnect)
    clearInterval(ping)
    for (const ack of acks.values()) {
      clearTimeout(ack.timer)
      ack.reject(failure ?? new Error("Luồng chép lời đã đóng."))
    }
    acks.clear()
    try {
      port.disconnect()
    } catch {
      /* Already disconnected. */
    }
  }
  const fail = (error: Error) => {
    if (closed) return
    failure = error
    reject(error)
    cleanup()
  }
  const abort = () => fail(new DOMException("Đã hủy chép lời.", "AbortError"))
  const disconnect = () =>
    fail(new Error("Kết nối extension bị ngắt. Hãy mở lại trang rồi thử lại."))
  const message = (value: TranscriptionMessage) => {
    if (closed || value?.id !== metadata.id) return
    if (value.type === "ack") {
      const ack = acks.get(value.index)
      if (!ack) {
        fail(new Error("Thứ tự truyền file không hợp lệ."))
        return
      }
      clearTimeout(ack.timer)
      acks.delete(value.index)
      ack.resolve()
      progress({ loaded: value.loaded })
    } else if (value.type === "processing") progress({ processing: true })
    else if (value.type === "text") progress({ text: value.text })
    else if (value.type === "done") {
      resolve(value.result)
      cleanup()
    } else if (value.type === "error") fail(new Error(value.message))
  }
  const ping = setInterval(() => {
    if (!closed) {
      try {
        port.postMessage({ type: "ping" })
      } catch {
        disconnect()
      }
    }
  }, 20000)
  const send = (value: unknown, index: number) =>
    new Promise<void>((yes, no) => {
      if (closed) {
        no(failure ?? new Error("Luồng chép lời đã đóng."))
        return
      }
      const timer = setTimeout(() => fail(new Error("Chuẩn bị file quá lâu. Hãy thử lại.")), 25000)
      acks.set(index, { resolve: yes, reject: no, timer })
      try {
        port.postMessage(value)
      } catch {
        disconnect()
      }
    })
  port.onMessage.addListener(message)
  port.onDisconnect.addListener(disconnect)
  signal.addEventListener("abort", abort, { once: true })
  try {
    if (signal.aborted) abort()
    await send(metadata, -1)
    let index = 0
    for (let offset = 0; offset < file.size; offset += AUDIO_CHUNK) {
      signal.throwIfAborted()
      const bytes = new Uint8Array(await file.slice(offset, offset + AUDIO_CHUNK).arrayBuffer())
      signal.throwIfAborted()
      await send({ type: "chunk", index, data: encodeAudioChunk(bytes) }, index++)
    }
    if (closed) throw failure ?? new Error("Luồng chép lời đã đóng.")
    port.postMessage({ type: "commit" })
    return await result
  } finally {
    cleanup()
  }
}
