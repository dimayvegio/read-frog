import { Dexie } from "dexie"
import JSZip from "jszip"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createVocabularyZip, readVocabularyZip } from "../archive"
import {
  vocabularyDB,
  importLibrary,
  exportLibrary,
  addVocabularySource,
  loadVocabularySources,
  moveVocabularyCard,
  createNotebook,
  deleteVocabularyCard,
  VocabularyDatabase,
} from "../db"
import { createLearningRun } from "../guided-learning"
import { sourceFromCapture, sourceLink } from "../sources"
import { vocabularyFixture, vocabularyV4Zip } from "./fixtures"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
beforeEach(async () => {
  for (const table of vocabularyDB.tables) await table.clear()
})
async function fixture() {
  const bundle = await vocabularyFixture()
  await importLibrary(bundle)
  const stored = await exportLibrary(),
    notebookId = stored.notebook!.id,
    cardId = stored.cards[0]!.id
  const capture = {
    word: "reverse",
    context: "They reverse the decision.",
    sourceTitle: "A video",
    sourceUrl: "https://www.youtube.com/watch?v=fixture",
    source: { kind: "video" as const, seconds: 65 },
  }
  const source = (await sourceFromCapture(cardId, capture))!
  return { stored, notebookId, cardId, capture, source }
}
describe("separate, portable source passages", () => {
  it("deduplicates one passage without changing any schedule or answer event", async () => {
    const { stored, notebookId, capture, cardId, source } = await fixture()
    expect(await addVocabularySource(notebookId, source)).toBe(true)
    expect(
      await addVocabularySource(
        notebookId,
        (await sourceFromCapture(cardId, capture, "A fresh AI translation"))!,
      ),
    ).toBe(false)
    const result = await exportLibrary()
    expect(result.progress).toEqual(stored.progress)
    expect(result.events).toBeUndefined()
    expect(result.cards).toEqual(stored.cards)
    expect(result.sources).toHaveLength(1)
    expect(sourceLink(source)).toContain("t=65")
  })
  it("retains sources through repeated ZIP v6 import without duplicating progress", async () => {
    const { notebookId, source } = await fixture()
    await addVocabularySource(notebookId, source)
    const exported = await exportLibrary(),
      bytes = await createVocabularyZip(exported),
      read = await readVocabularyZip(bytes)
    expect(
      JSON.parse(await (await JSZip.loadAsync(bytes)).file("manifest.json")!.async("string"))
        .version,
    ).toBe(6)
    await importLibrary(read)
    await importLibrary(read)
    expect(await loadVocabularySources(notebookId)).toEqual([source])
    expect((await exportLibrary()).progress).toEqual(exported.progress)
  })
  it("rejects source references outside a notebook inventory", async () => {
    const { source } = await fixture(),
      bundle = await exportLibrary()
    const zip = await JSZip.loadAsync(
      await createVocabularyZip({ ...bundle, sources: [{ ...source, cardId: "f".repeat(64) }] }),
    )
    await expect(
      readVocabularyZip(await zip.generateAsync({ type: "uint8array" })),
    ).rejects.toThrow("Câu nguồn")
  })
  it("bounds per-card sources and rolls the extra passage back", async () => {
    const { notebookId, source } = await fixture()
    for (let n = 0; n < 20; n++)
      await addVocabularySource(notebookId, {
        ...source,
        id: n.toString(16).padStart(64, "0"),
        context: `Source ${n}`,
      })
    await expect(
      addVocabularySource(notebookId, { ...source, id: "e".repeat(64) }),
    ).rejects.toThrow("20 câu")
    expect(await loadVocabularySources(notebookId)).toHaveLength(20)
  })
  it("moves sources with a word and deletes only the deleted word's passages", async () => {
    const { notebookId, cardId, source } = await fixture()
    await addVocabularySource(notebookId, source)
    const second = await createNotebook("Second")
    await moveVocabularyCard(cardId, notebookId, second.id)
    expect(await loadVocabularySources(notebookId)).toEqual([])
    expect(await loadVocabularySources(second.id)).toEqual([source])
    await deleteVocabularyCard(cardId, second.id)
    expect(await loadVocabularySources(second.id)).toEqual([])
  })
  it("keeps conflicting source imports atomic", async () => {
    const { notebookId, source } = await fixture()
    await addVocabularySource(notebookId, source)
    const before = await exportLibrary()
    await expect(
      importLibrary({ ...before, sources: [{ ...source, context: "A different passage" }] }),
    ).rejects.toThrow("trùng ID")
    expect(await exportLibrary()).toEqual(before)
  })
  it("reads a published v5 archive with no invented encounters", async () => {
    const bundle = await vocabularyFixture(),
      zip = await JSZip.loadAsync(await vocabularyV4Zip(bundle))
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"))
    manifest.version = 5
    zip.file("manifest.json", JSON.stringify(manifest))
    const read = await readVocabularyZip(await zip.generateAsync({ type: "uint8array" }))
    expect(read.sources).toBeUndefined()
    expect(read.cards).toEqual(bundle.cards)
  })
  it("uses saved passages in different cloze rounds without adding answer logs", async () => {
    const { stored, source, notebookId } = await fixture()
    const next = { ...source, id: "d".repeat(64), context: "We reverse the order tomorrow." }
    const run = createLearningRun(notebookId, stored.cards, [], stored.progress, "cloze", 1000, [
      source,
      next,
    ])
    expect(run.queue[0]!.prompt).toBe("They _____ the decision.")
    expect(run.queue[1]!.prompt).toBe("We _____ the order tomorrow.")
    expect(await vocabularyDB.reviewEvents.count()).toBe(0)
  })
  it("opens a frozen v4 DB without rewriting learning runs or inventing sources", async () => {
    const name = `source-migration-${crypto.randomUUID()}`,
      old = new Dexie(name)
    old.version(4).stores({
      cards: "&id, captureKey, updatedAt",
      audio: "&id",
      progress: "&cardId",
      notebooks: "&id, &nameKey, createdAt",
      notebookCards: "&[notebookId+id], notebookId, id, captureKey",
      notebookProgress: "&[notebookId+cardId], notebookId",
      meta: "&key",
      reviewEvents: "&[notebookId+id], notebookId, [notebookId+cardId]",
      learningRuns: "&notebookId",
    })
    const run = {
      notebookId: crypto.randomUUID(),
      version: 1,
      queue: [{ prompt: "old frozen prompt" }],
    }
    await old.table("learningRuns").put(run)
    old.close()
    const next = new VocabularyDatabase(name)
    try {
      await next.open()
      expect(next.verno).toBe(5)
      expect(await next.learningRuns.toArray()).toEqual([run])
      expect(await next.sources.count()).toBe(0)
    } finally {
      await next.delete()
    }
  })
})
