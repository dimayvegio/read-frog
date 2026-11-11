import { Dexie } from "dexie"
import { expect, it, vi } from "vitest"
import { PdfOcrCache } from "../ocr-cache"
import { PdfTextNotes } from "../text-notes"
import { emptyWorkspace, pdfWorkspaceDB, PdfWorkspace } from "../workspace"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
it("upgrades published workspace DB1 additively without changing old records", async () => {
  pdfWorkspaceDB.close()
  await Dexie.delete("read-frog-pdf-workspace")
  const legacy = new Dexie("read-frog-pdf-workspace")
  legacy.version(1).stores({ documents: "id" })
  const value = emptyWorkspace("a".repeat(64))
  await legacy.table("documents").put(value)
  legacy.close()
  await pdfWorkspaceDB.open()
  expect(await pdfWorkspaceDB.documents.get(value.id)).toEqual(value)
  expect(pdfWorkspaceDB.verno).toBe(2)
  expect(await pdfWorkspaceDB.ocrPages.count()).toBe(0)
})
it("stores more than twenty OCR pages, rejects stale/cleared writes and caps the RAM page LRU", async () => {
  const cache = new PdfOcrCache("b".repeat(64))
  const page = (n: number) => ({
    page: n,
    language: "eng",
    engine: "tesseract7-int-v1" as const,
    words: [{ text: "signal", x: 0.1, y: 0.1, width: 0.1, height: 0.02 }],
  })
  for (let n = 1; n <= 25; n++) await cache.save(page(n), await cache.context(n), () => true)
  expect(await cache.count()).toBe(25)
  expect((cache as unknown as { cache: Map<number, unknown> }).cache.size).toBeLessThanOrEqual(6)
  const stale = await cache.context(1)
  await cache.clear()
  await expect(cache.save(page(1), stale, () => true)).rejects.toThrow(/đổi|xóa/)
  await expect(cache.save(page(2), await cache.context(2), () => false)).rejects.toThrow(/dừng/)
  expect(await cache.get(1)).toBeUndefined()
  cache.destroy()
})
it("shares text-box undo with workspace history, guards geometry and rejects a stale window", async () => {
  const workspace = new PdfWorkspace("c".repeat(64)),
    notes = new PdfTextNotes("c".repeat(64), workspace)
  await vi.waitFor(() =>
    expect(notes.getSnapshot().ready && workspace.getSnapshot().ready).toBe(true),
  )
  const note = {
    id: "one",
    page: 1,
    text: "Điện áp 日本語",
    color: "#17212e",
    font: 0.025,
    x: 0.1,
    y: 0.1,
    width: 0.4,
    height: 0.2,
  }
  await notes.edit(() => [note])
  expect(notes.getSnapshot().data.notes).toEqual([note])
  await workspace.reverse("undo")
  expect(notes.getSnapshot().data.notes).toEqual([])
  await workspace.reverse("redo")
  expect(notes.getSnapshot().data.notes).toEqual([note])
  const other = new PdfTextNotes("c".repeat(64), workspace)
  await other.reload()
  await notes.edit((list) => list.map((n) => ({ ...n, x: 0.2 })))
  expect(await other.edit(() => [])).toBe(false)
  expect(workspace.getSnapshot().error).toMatch(/cửa sổ khác/)
  notes.destroy()
  other.destroy()
  workspace.destroy()
})
