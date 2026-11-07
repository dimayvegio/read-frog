import { QueryClient } from "@tanstack/react-query"
import { beforeEach, it, expect, vi } from "vitest"
import { DEFAULT_OPENAI_TTS_CONFIG } from "@/types/openai-tts"
import { wavFixture } from "@/utils/vocabulary/__tests__/fixtures"
import { generateReadingAudio, readingSequence } from "../audio"
import { DEFAULT_READING_OPTIONS } from "../schema"
import { passageFixture, bundleFixture } from "./fixtures"
const { send, stream } = vi.hoisted(() => ({
  send: vi.fn<(...args: any[]) => any>(),
  stream: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("@/utils/message", () => ({ sendMessage: send }))
vi.mock("@/utils/content-script/port-streaming", () => ({ createPortStreamPromise: stream }))
beforeEach(() => {
  vi.clearAllMocks()
  send.mockResolvedValue({ configured: true, revision: 1 })
  stream.mockResolvedValue({
    audioBase64: Buffer.from(wavFixture()).toString("base64"),
    contentType: "audio/wav",
  })
})
it("creates both sides independently of playback, reuses finished audio and leaves original data intact", async () => {
  const passage = passageFixture(),
    client = new QueryClient(),
    signal = new AbortController().signal
  const generated = await generateReadingAudio(
    passage,
    [],
    DEFAULT_OPENAI_TTS_CONFIG,
    client,
    signal,
    true,
    () => {},
  )
  expect(stream).toHaveBeenCalledTimes(4)
  expect(stream.mock.calls.every(([name]) => name === "openai-tts-file")).toBe(true)
  expect(passage.pairs[0]!.originalAudio).toBeNull()
  expect(generated.passage.pairs.every((pair) => pair.originalAudio && pair.translationAudio)).toBe(
    true,
  )
  await generateReadingAudio(
    generated.passage,
    generated.assets,
    DEFAULT_OPENAI_TTS_CONFIG,
    client,
    signal,
    true,
    () => {},
  )
  expect(stream).toHaveBeenCalledTimes(4)
  expect(send.mock.calls.some(([name]) => /ttsPlayback/.test(name))).toBe(false)
})
it("uses the exact repeat/gap/translation sequence for listening and export", async () => {
  const bundle = await bundleFixture(),
    passage = bundle.passages[0]!
  const steps = readingSequence(passage, bundle.assets, { gap: 3, repeats: 2, translation: true })
  expect(steps.map((step) => step.side)).toEqual([
    "original",
    "gap",
    "original",
    "gap",
    "translation",
    "gap",
    "original",
    "gap",
    "original",
    "gap",
    "translation",
  ])
  expect(
    readingSequence(passage, bundle.assets, { gap: 0, repeats: 1, translation: false }).map(
      (step) => step.side,
    ),
  ).toEqual(["original", "original"])
  expect(() => readingSequence(passage, [], DEFAULT_READING_OPTIONS)).toThrow(/Chưa có đủ/)
})
it("aborts pending generation and rejects a changed credential without mutating the lesson", async () => {
  const passage = passageFixture(),
    controller = new AbortController()
  let finish!: (value: unknown) => void
  stream.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = generateReadingAudio(
    passage,
    [],
    DEFAULT_OPENAI_TTS_CONFIG,
    new QueryClient(),
    controller.signal,
    false,
    () => {},
  )
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"))
  controller.abort()
  finish({ audioBase64: "", contentType: "audio/wav" })
  await expect(pending).rejects.toThrow(/abort|cancel/i)
  send
    .mockResolvedValueOnce({ configured: true, revision: 1 })
    .mockResolvedValueOnce({ configured: true, revision: 2 })
  await expect(
    generateReadingAudio(
      passage,
      [],
      DEFAULT_OPENAI_TTS_CONFIG,
      new QueryClient(),
      new AbortController().signal,
      false,
      () => {},
    ),
  ).rejects.toThrow(/key đã đổi/)
  expect(passage.pairs.every((pair) => !pair.originalAudio)).toBe(true)
})
