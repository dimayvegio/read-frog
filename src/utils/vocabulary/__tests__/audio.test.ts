import { describe, it, expect } from "vitest"
import { compressVocabularyAudio, compressVocabularyBundle, isMp3 } from "../audio"
import { sha256, type AudioAsset } from "../schema"
import { vocabularyFixture, wavFixture } from "./fixtures"

describe("portable vocabulary MP3 compression", () => {
  it("encodes deterministic mono MP3 and checks complete MPEG frames", async () => {
    const bundle = await vocabularyFixture(),
      source = bundle.audio[0]!
    const first = await compressVocabularyAudio(source),
      second = await compressVocabularyAudio(source)
    expect(first).toEqual(second)
    expect(first.contentType).toBe("audio/mpeg")
    expect(first.id).toBe(await sha256(first.bytes))
    expect(isMp3(first.bytes)).toBe(true)
    expect(isMp3(first.bytes.slice(0, -1))).toBe(false)
    expect(isMp3(new Uint8Array([255, 255, 255, 255]))).toBe(false)
    expect(isMp3(source.bytes)).toBe(false)
    expect(await compressVocabularyAudio(first)).toBe(first)
  })
  it("keeps a tiny WAV lossless when MP3 would be larger", async () => {
    const bytes = wavFixture().slice(0, 46),
      view = new DataView(bytes.buffer)
    view.setUint32(4, 38, true)
    view.setUint32(40, 2, true)
    const source: AudioAsset = { id: await sha256(bytes), bytes, contentType: "audio/wav" }
    expect(await compressVocabularyAudio(source)).toBe(source)
  })
  it.each([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000])(
    "supports a PCM16 source at %i Hz",
    async (rate) => {
      const bytes = wavFixture(),
        view = new DataView(bytes.buffer)
      view.setUint32(24, rate, true)
      view.setUint32(28, rate * 2, true)
      const result = await compressVocabularyAudio({
        id: await sha256(bytes),
        bytes,
        contentType: "audio/wav",
      })
      expect(result.contentType === "audio/wav" || isMp3(result.bytes)).toBe(true)
    },
  )
  it("preserves unsupported legacy WAV instead of corrupting or dropping audio", async () => {
    const bytes = wavFixture()
    new DataView(bytes.buffer).setUint16(20, 3, true)
    const source: AudioAsset = { id: await sha256(bytes), bytes, contentType: "audio/wav" }
    expect(await compressVocabularyAudio(source)).toBe(source)
  })
  it("cancels before work and during encoding without modifying the input", async () => {
    const source = (await vocabularyFixture()).audio[0]!,
      controller = new AbortController()
    controller.abort()
    await expect(compressVocabularyAudio(source, controller.signal)).rejects.toThrow(/abort/i)
    const next = new AbortController(),
      snapshot = source.bytes.slice(),
      operation = compressVocabularyAudio(source, next.signal)
    next.abort()
    await expect(operation).rejects.toThrow(/abort/i)
    expect(source.bytes).toEqual(snapshot)
  })
  it("deduplicates converted assets, removes unused audio and refuses missing references", async () => {
    const bundle = await vocabularyFixture()
    bundle.cards[0]!.audio.example = bundle.cards[0]!.audio.word
    expect((await compressVocabularyBundle(bundle)).audio).toHaveLength(1)
    bundle.audio = []
    await expect(compressVocabularyBundle(bundle)).rejects.toThrow("thiếu audio")
  })
})
