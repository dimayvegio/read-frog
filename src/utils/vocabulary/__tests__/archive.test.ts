import JSZip from "jszip"
import { describe, expect, it, vi } from "vitest"
import { createVocabularyZip, readVocabularyZip, inspectZip } from "../archive"
import {
  normalizeAnswer,
  safeSourceUrl,
  emptyProgress,
  scheduleReview,
  mergeProgress,
  sha256,
} from "../schema"
import { vocabularyFixture } from "./fixtures"

describe("portable vocabulary archive", () => {
  it("round trips content, original Vietnamese accents, real WAV bytes and all three schedules", async () => {
    const bundle = await vocabularyFixture()
    bundle.progress[0]!.type = scheduleReview(bundle.progress[0]!.type, "good", 2000)
    const bytes = await createVocabularyZip(bundle)
    expect(inspectZip(bytes).size).toBe(5)
    const result = await readVocabularyZip(bytes)
    expect(result).toEqual(bundle)
  })
  it("rejects unknown versions and detached secrets instead of accepting a loose JSON blob", async () => {
    const bundle = await vocabularyFixture(),
      zip = await JSZip.loadAsync(await createVocabularyZip(bundle))
    zip.file(
      "manifest.json",
      JSON.stringify({
        format: "read-frog-vocabulary",
        version: 2,
        title: "test",
        exportedAt: 1,
        cardCount: 1,
      }),
    )
    await expect(
      readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow(/Invalid/)
    zip.file(
      "manifest.json",
      JSON.stringify({
        format: "read-frog-vocabulary",
        version: 1,
        title: "test",
        exportedAt: 1,
        cardCount: 1,
      }),
    )
    zip.file(
      "vocabulary.json",
      JSON.stringify([{ ...bundle.cards[0], apiKey: "never-import-this" }]),
    )
    await expect(
      readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow(/Unrecognized/)
  })
  it("rejects missing, replaced or corrupt audio", async () => {
    const bundle = await vocabularyFixture(),
      zip = await JSZip.loadAsync(await createVocabularyZip(bundle))
    zip.file(`audio/${bundle.audio[0]!.id}.wav`, bundle.audio[1]!.bytes, { createFolders: false })
    await expect(
      readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow("Audio")
    zip.remove(`audio/${bundle.audio[0]!.id}.wav`)
    await expect(
      readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow(/audio/)
  })
  it.each(["../escape.txt", "audio/../../escape", "injected.html", "audio/not-a-hash.wav"])(
    "rejects unexpected paths before extraction: %s",
    async (name) => {
      const bundle = await vocabularyFixture(),
        zip = await JSZip.loadAsync(await createVocabularyZip(bundle))
      zip.file(name, "untrusted", { createFolders: false })
      expect(() => inspectZip(new Uint8Array())).toThrow(/ZIP/)
      await expect(
        readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
      ).rejects.toThrow(/tên file/)
    },
  )
  it("rejects an oversized expanded entry from central-directory metadata before inflation", async () => {
    const bytes = await createVocabularyZip(await vocabularyFixture())
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let i = 0; i < bytes.length - 46; i++)
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint32(i + 24, 100 * 1024 * 1024, true)
        break
      }
    expect(() => inspectZip(bytes)).toThrow("quá lớn")
  })
  it("bounds actual inflation when an attacker understates an entry's expanded size", async () => {
    const bytes = await createVocabularyZip(await vocabularyFixture())
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let i = 0; i < bytes.length - 46; i++)
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint32(i + 24, 1, true)
        break
      }
    await expect(readVocabularyZip(bytes)).rejects.toThrow(/kích thước/)
  })
  it("rejects duplicate card IDs, alien progress and ambiguous choices", async () => {
    const bundle = await vocabularyFixture(),
      zip = await JSZip.loadAsync(await createVocabularyZip(bundle))
    zip.file("progress.json", JSON.stringify([emptyProgress("a".repeat(64))]))
    await expect(
      readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow("ID")
    zip.file("progress.json", JSON.stringify(bundle.progress))
    zip.file(
      "vocabulary.json",
      JSON.stringify([{ ...bundle.cards[0], distractors: [bundle.cards[0]!.meaning, "a", "b"] }]),
    )
    await expect(
      readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow("trùng")
  })
  it("handles an empty library export and deduplicated audio", async () => {
    expect(
      await readVocabularyZip(await createVocabularyZip({ cards: [], audio: [], progress: [] })),
    ).toEqual({ cards: [], audio: [], progress: [] })
    const bundle = await vocabularyFixture()
    bundle.cards[0]!.audio.example = bundle.cards[0]!.audio.word
    const result = await readVocabularyZip(await createVocabularyZip(bundle))
    expect(result.audio).toHaveLength(1)
  })
})
describe("review rules", () => {
  it("verifies the same SHA-256 when a mobile/HTTP context lacks SubtleCrypto", async () => {
    vi.stubGlobal("crypto", {})
    try {
      expect(await sha256("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it("normalizes case, curly apostrophes, composed Unicode and whitespace without stripping meaningful accents", () => {
    expect(normalizeAnswer("  CAN’T   stop ")).toBe(normalizeAnswer("can't stop"))
    expect(normalizeAnswer("đảo")).toBe(normalizeAnswer("đảo"))
    expect(normalizeAnswer("má")).not.toBe(normalizeAnswer("ma"))
  })
  it("schedules a lapse early and preserves independent review modes on merge", () => {
    const a = emptyProgress("a".repeat(64)),
      b = emptyProgress(a.cardId)
    a.flash = scheduleReview(a.flash, "easy", 1000)
    b.type = scheduleReview(b.type, "again", 2000)
    const merged = mergeProgress(a, b)
    expect(merged.flash).toEqual(a.flash)
    expect(merged.type.dueAt).toBe(62000)
    expect(merged.type.lapses).toBe(1)
    expect(merged.choice.reviews).toBe(0)
    expect(scheduleReview(a.flash, "good", 2000).intervalDays).toBeGreaterThan(a.flash.intervalDays)
  })
  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///C:/private.pdf",
    "https://user:pass@example.com/",
  ])("does not turn a stored source into an executable/credential URL: %s", (url) => {
    expect(safeSourceUrl(url)).toBe("")
  })
})
