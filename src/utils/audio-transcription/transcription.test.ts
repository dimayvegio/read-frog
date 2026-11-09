import { TextDecoder, TextEncoder } from "node:util"
import { beforeEach, expect, it, vi } from "vitest"
import { readTranscriptionResponse, transcriptionFinal } from "./response"
import {
  AUDIO_CHUNK,
  audioFormat,
  decodeAudioChunk,
  encodeAudioChunk,
  MAX_AUDIO_FILE,
  startSchema,
  validateAudioHeader,
} from "./schema"
import { LiveTranscript } from "./tab-schema"
beforeEach(() => {
  vi.stubGlobal("TextEncoder", TextEncoder)
  vi.stubGlobal("TextDecoder", TextDecoder)
})
it("bounds file metadata and supports multilingual hint codes without filenames", () => {
  const start = {
    type: "start",
    id: crypto.randomUUID(),
    format: "mp3",
    size: 100,
    languages: ["en", "zh", "ja", "vi"],
    prompt: "Domain terms",
  }
  expect(startSchema.parse(start)).toEqual(start)
  for (const patch of [
    { size: MAX_AUDIO_FILE + 1 },
    { size: 0 },
    { format: "exe" },
    { languages: ["en", "en"] },
    { languages: ["English"] },
    { prompt: "x".repeat(1001) },
    { filename: "private.mp3" },
  ])
    expect(startSchema.safeParse({ ...start, ...patch }).success).toBe(false)
  expect(
    startSchema.parse({ ...start, languages: ["EN", "zh-tw", "yue", "fr"] }).languages,
  ).toEqual(["en", "zh-tw", "yue", "fr"])
  expect(audioFormat("private.MP3")).toBe("mp3")
  expect(audioFormat("private.mp3.exe")).toBeNull()
})
it("validates independent file headers and bounded base64 chunks", () => {
  const bytes = Uint8Array.from({ length: AUDIO_CHUNK }, (_, i) => i % 256)
  expect(decodeAudioChunk(encodeAudioChunk(bytes))).toEqual(bytes)
  for (const invalid of ["!bad", "AAAAA", "A".repeat(AUDIO_CHUNK * 2), null])
    expect(() => decodeAudioChunk(invalid)).toThrow(/./)
  validateAudioHeader(new TextEncoder().encode("RIFFxxxxWAVEdata"), "wav")
  validateAudioHeader(new TextEncoder().encode("ID3"), "mp3")
  validateAudioHeader(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), "webm")
  expect(() => validateAudioHeader(bytes, "webm")).toThrow(/./)
  expect(() => validateAudioHeader(new TextEncoder().encode("RIFFxxxxWAVEdata"), "mp3")).toThrow(
    /./,
  )
})
function sse(events: unknown[], truncate = false) {
  const text = events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join("")
  const bytes = new TextEncoder().encode(text)
  let index = 0
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (index >= bytes.length) {
          controller.close()
          return
        }
        // Split CR/LF, JSON and multibyte characters across network chunks.
        controller.enqueue(bytes.slice(index, ++index))
      },
    }),
    { headers: { "content-type": truncate ? "application/json" : "text/event-stream" } },
  )
}
it("streams Unicode but completes only with a validated final event and actual usage", async () => {
  const partial: string[] = []
  const result = await readTranscriptionResponse(
    sse([
      { type: "transcript.text.delta", delta: "Tiếng Việt / " },
      { type: "transcript.text.delta", delta: "中文 / 日本語" },
      {
        type: "transcript.text.done",
        text: "Tiếng Việt / 中文 / 日本語.",
        languages: [{ code: "vi" }, { code: "zh" }, { code: "ja" }],
        usage: { type: "duration", seconds: 12.5 },
      },
    ]),
    new AbortController().signal,
    (text) => partial.push(text),
  )
  expect(partial.at(-1)).toBe("Tiếng Việt / 中文 / 日本語")
  expect(result.result.text).toBe("Tiếng Việt / 中文 / 日本語.")
  expect(result.result.seconds).toBe(12.5)
  expect(result.result.languages).toEqual(["vi", "zh", "ja"])
})
it("rejects truncated streams and provider failures without inventing final text", async () => {
  for (const events of [
    [{ type: "transcript.text.delta", delta: "unfinished" }],
    [{ type: "error", error: "secret diagnostic" }],
    [{ type: "transcript.text.done", text: 5 }],
  ])
    await expect(
      readTranscriptionResponse(sse(events), new AbortController().signal, () => {}),
    ).rejects.toThrow(/./)
  const abort = new AbortController()
  abort.abort()
  await expect(readTranscriptionResponse(sse([]), abort.signal, () => {})).rejects.toThrow(/./)
  expect(
    transcriptionFinal({
      text: "Hello",
      usage: { type: "tokens", input_tokens: 10, output_tokens: 3 },
    }).result.seconds,
  ).toBeNull()
  expect(
    transcriptionFinal({ text: "Hello", usage: { type: "duration", seconds: -1 } }).usage,
  ).toBeNull()
})
it("accepts bounded JSON fallback without detected-language guesses", async () => {
  const value = await readTranscriptionResponse(
    new Response(JSON.stringify({ text: "Hello", languages: [] })),
    new AbortController().signal,
    () => {},
  )
  expect(value.result.languages).toEqual([])
  expect(value.result.seconds).toBeNull()
})
it("matches reordered and repeated realtime events to committed audio turns", () => {
  const track = new LiveTranscript()
  const update = (type: string, item_id: string, patch: object) =>
    track.update({ type, item_id, ...patch })
  update("conversation.item.input_audio_transcription.delta", "second", { delta: "Chưa chốt" })
  update("conversation.item.input_audio_transcription.completed", "second", {
    transcript: "Second.",
  })
  update("input_audio_buffer.committed", "second", { previous_item_id: "first" })
  update("input_audio_buffer.committed", "first", { previous_item_id: null })
  const complete = update("conversation.item.input_audio_transcription.completed", "first", {
    transcript: "First.",
  })
  expect(complete).toEqual({ text: "First.\n\nSecond.", pending: "" })
  expect(
    update("conversation.item.input_audio_transcription.completed", "first", {
      transcript: "First.",
    }),
  ).toEqual(complete)
  expect(
    update("conversation.item.input_audio_transcription.delta", "first", { delta: "duplicate" }),
  ).toBeNull()
})
