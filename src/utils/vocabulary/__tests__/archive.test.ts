import JSZip from "jszip"
import { describe, expect, it, vi } from "vitest"
import {
  createVocabularyZip as createCompressedVocabularyZip,
  readVocabularyZip,
  inspectZip,
} from "../archive"
import { compressVocabularyBundle, isMp3 } from "../audio"
import {
  normalizeAnswer,
  safeSourceUrl,
  emptyProgress,
  scheduleReview,
  mergeProgress,
  sha256,
} from "../schema"
import {
  vocabularyFixture,
  legacyVocabularyZip as createVocabularyZip,
  vocabularyV4Zip,
} from "./fixtures"

describe("portable vocabulary archive", () => {
  it("reads published v4 answer logs and schedules unchanged without inventing exercise metadata", async () => {
    const bundle = await vocabularyFixture()
    bundle.events = [
      {
        id: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
        cardId: bundle.cards[0]!.id,
        occurredAt: 1000,
        mode: "type",
        result: "incorrect",
        word: "reverse",
        language: "en-US",
        meaning: "đảo ngược",
        answer: "revert",
        elapsedMs: 1200,
        grade: null,
        gradedAt: 0,
      },
    ]
    const restored = await readVocabularyZip(await vocabularyV4Zip(bundle))
    expect(restored.events).toEqual(bundle.events)
    expect(restored.progress).toEqual(bundle.progress)
    expect(restored.cards).toEqual(bundle.cards)
    expect(restored.audio).toEqual(bundle.audio)
    expect(restored.events![0]!.exercise).toBeUndefined()
  })
  it("exports smaller v4 MP3 archives without changing the original cards, notebook or histories", async () => {
    const original = await vocabularyFixture(),
      snapshot = structuredClone(original)
    original.notebook = {
      id: "5a4f50d2-4765-4317-bfa2-61448a31045e",
      name: "Tiếng Anh",
      createdAt: 1,
      updatedAt: 2,
    }
    const bytes = await createCompressedVocabularyZip(original),
      result = await readVocabularyZip(bytes)
    expect(result).toEqual(await compressVocabularyBundle(original))
    expect(result.notebook).toEqual(original.notebook)
    expect(result.cards[0]!.id).toBe(original.cards[0]!.id)
    expect(result.cards[0]!.updatedAt).toBe(original.cards[0]!.updatedAt)
    expect(result.progress).toEqual(original.progress)
    expect(original.cards).toEqual(snapshot.cards)
    expect(original.audio).toEqual(snapshot.audio)
    expect(
      result.audio.every((asset) => asset.contentType === "audio/mpeg" && isMp3(asset.bytes)),
    ).toBe(true)
    expect(bytes.length).toBeLessThan((await createVocabularyZip(original)).length)
    const zip = await JSZip.loadAsync(bytes)
    expect(JSON.parse(await zip.file("manifest.json")!.async("string")).version).toBe(6)
    // Re-exporting an imported MP3 does not compound lossy compression.
    expect((await readVocabularyZip(await createCompressedVocabularyZip(result))).audio).toEqual(
      result.audio,
    )
  })
  it("rejects truncated, wrong-hash MP3, duplicate formats and MP3 hidden in a legacy version", async () => {
    const source = await createCompressedVocabularyZip(await vocabularyFixture()),
      zip = await JSZip.loadAsync(source)
    const name = Object.keys(zip.files).find((entryName) => entryName.endsWith(".mp3"))!,
      good = await zip.file(name)!.async("uint8array")
    zip.file(name, good.subarray(0, good.length - 1), { createFolders: false })
    await expect(
      readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow("Audio")
    zip.file(name, good, { createFolders: false })
    const altered = new Uint8Array(good)
    altered[10] = altered[10]! ^ 1
    zip.file(name, altered, { createFolders: false })
    await expect(
      readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow("Audio")
    zip.file(name, good, { createFolders: false })
    zip.file(name.replace(".mp3", ".wav"), good, { createFolders: false })
    await expect(
      readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow("Số file")
    zip.remove(name.replace(".mp3", ".wav"))
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"))
    manifest.version = 1
    delete manifest.reviewCount
    delete manifest.sourceCount
    zip.remove("sources.json")
    zip.file("manifest.json", JSON.stringify(manifest))
    await expect(
      readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow("v1/v2")
  })
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
  it("round trips a named notebook ZIP v2 while continuing to read v1", async () => {
    const bundle = await vocabularyFixture()
    bundle.notebook = {
      id: "5a4f50d2-4765-4317-bfa2-61448a31045e",
      name: "Tiếng Anh công việc",
      createdAt: 1,
      updatedAt: 2,
    }
    const zip = await createVocabularyZip(bundle)
    expect(await readVocabularyZip(zip)).toEqual(bundle)
    expect(
      JSON.parse(await (await JSZip.loadAsync(zip)).file("manifest.json")!.async("string")).version,
    ).toBe(2)
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
