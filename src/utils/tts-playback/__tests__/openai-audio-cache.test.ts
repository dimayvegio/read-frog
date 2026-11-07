import { QueryClient } from "@tanstack/react-query"
import { it, expect, vi } from "vitest"
import { DEFAULT_OPENAI_TTS_CONFIG } from "@/types/openai-tts"
import { getOpenAIAudio } from "../openai-audio-cache"

const audio = { audioBase64: "cached-wav", contentType: "audio/wav" }
it("shares finished/pending audio and invalidates on voice, model, speed, instructions and key revision", async () => {
  const client = new QueryClient(),
    signal = new AbortController().signal
  const generate = vi.fn<() => Promise<typeof audio>>().mockResolvedValue(audio)
  const get = (config = DEFAULT_OPENAI_TTS_CONFIG, revision = 1) =>
    getOpenAIAudio(client, "same", config, revision, signal, generate)
  await Promise.all([get(), get()])
  await get()
  expect(generate).toHaveBeenCalledTimes(1)
  await get({ ...DEFAULT_OPENAI_TTS_CONFIG, voice: "coral" })
  await get({ ...DEFAULT_OPENAI_TTS_CONFIG, model: "gpt-4o-mini-tts" })
  await get({ ...DEFAULT_OPENAI_TTS_CONFIG, speed: 1.2 })
  await get({ ...DEFAULT_OPENAI_TTS_CONFIG, instructions: "Clearly" })
  await get(DEFAULT_OPENAI_TTS_CONFIG, 2)
  expect(generate).toHaveBeenCalledTimes(6)
})
it("canceling a waiting download does not cancel the speaker, and stopping the speaker lets a download generate independently", async () => {
  const client = new QueryClient(),
    speaker = new AbortController(),
    download = new AbortController()
  let finish!: (value: typeof audio) => void
  const primary = getOpenAIAudio(
    client,
    "one",
    DEFAULT_OPENAI_TTS_CONFIG,
    1,
    speaker.signal,
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const generate = vi.fn<() => Promise<typeof audio>>().mockResolvedValue(audio)
  const waiting = getOpenAIAudio(
    client,
    "one",
    DEFAULT_OPENAI_TTS_CONFIG,
    1,
    download.signal,
    generate,
  )
  download.abort()
  await expect(waiting).rejects.toThrow(/cancel|abort/i)
  expect(speaker.signal.aborted).toBe(false)
  finish(audio)
  await primary
  expect(generate).not.toHaveBeenCalled()

  const old = new AbortController()
  const stopped = getOpenAIAudio(
    client,
    "two",
    DEFAULT_OPENAI_TTS_CONFIG,
    1,
    old.signal,
    () =>
      new Promise((_resolve, reject) =>
        old.signal.addEventListener("abort", () =>
          reject(new DOMException("stopped", "AbortError")),
        ),
      ),
  )
  await Promise.resolve()
  const replacement = getOpenAIAudio(
    client,
    "two",
    DEFAULT_OPENAI_TTS_CONFIG,
    1,
    new AbortController().signal,
    generate,
  )
  old.abort()
  await expect(stopped).rejects.toThrow(/cancel|abort/i)
  expect(await replacement).toEqual(audio)
  expect(generate).toHaveBeenCalledTimes(1)
})
