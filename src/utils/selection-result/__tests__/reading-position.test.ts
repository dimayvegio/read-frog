import { Dexie } from "dexie"
import { sha256 } from "js-sha256"
import { beforeEach, expect, it, vi } from "vitest"
import { PdfHistoryDatabase, pdfHistoryDB, clearPdfHistory } from "../pdf-history"
import { pdfReadingPositionSchema } from "../reading-position"
import {
  getPdfReadingPosition,
  savePdfReadingPosition,
  forgetPdfReadingPosition,
} from "../reading-position-db"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
const id = sha256("file contents"),
  other = sha256("other contents")
const position = {
  documentId: id,
  historyDocumentId: id,
  title: "Book.pdf",
  pageCount: 100,
  page: 19,
  offset: 0.35,
  zoom: 1.5 as const,
  updatedAt: 100,
}
beforeEach(async () => {
  for (const table of pdfHistoryDB.tables) await table.clear()
})
it("keeps positions isolated by content identity, without storing file bytes, paths or credentials", async () => {
  expect(await getPdfReadingPosition(id)).toEqual({ position: null, epoch: 0 })
  expect(await savePdfReadingPosition(position, 0)).toBe("saved")
  expect((await getPdfReadingPosition(id)).position).toEqual(position)
  expect((await getPdfReadingPosition(other)).position).toBeNull()
  expect(JSON.stringify(await pdfHistoryDB.positions.toArray())).not.toMatch(
    /file:|apiKey|bytes|sourceUrl/,
  )
})
it("an old tab closing cannot overwrite more recent reading activity", async () => {
  await savePdfReadingPosition({ ...position, updatedAt: 200, page: 40 }, 0)
  expect(await savePdfReadingPosition(position, 0)).toBe("stale")
  expect((await getPdfReadingPosition(id)).position?.page).toBe(40)
})
it("forget wins over in-flight saves and does not clear translations or another PDF", async () => {
  await savePdfReadingPosition(position, 0)
  await savePdfReadingPosition({ ...position, documentId: other }, 0)
  await pdfHistoryDB.documents.put({ id, title: "Book.pdf", epoch: 4, updatedAt: 1 })
  const epoch = await forgetPdfReadingPosition(id)
  expect(epoch).toBe(1)
  expect(await savePdfReadingPosition({ ...position, updatedAt: 999 }, 0)).toBe("cleared")
  expect((await getPdfReadingPosition(id)).position).toBeNull()
  expect((await getPdfReadingPosition(other)).position).not.toBeNull()
  expect((await pdfHistoryDB.documents.get(id))?.epoch).toBe(4)
  expect(await savePdfReadingPosition({ ...position, updatedAt: 1000 }, epoch)).toBe("saved")
  await clearPdfHistory({ id, title: "Book.pdf" })
  expect((await getPdfReadingPosition(id)).position?.page).toBe(19)
})
it("validates page count, scroll, zoom and document identity", () => {
  for (const patch of [
    { page: 101 },
    { page: 0 },
    { offset: -1 },
    { offset: 1.01 },
    { zoom: 10 },
    { documentId: "file:///book.pdf" },
    { pageCount: 0 },
    { updatedAt: -1 },
  ])
    expect(pdfReadingPositionSchema.safeParse({ ...position, ...patch }).success).toBe(false)
})
it("upgrades the published history v1 additively with all original records intact", async () => {
  const name = `pdf-v1-${crypto.randomUUID()}`,
    legacy = new Dexie(name)
  legacy.version(1).stores({
    documents: "&id, updatedAt",
    translations: "&id, documentId, updatedAt",
    meta: "&key",
  })
  const document = { id, title: "Book.pdf", epoch: 9, updatedAt: 12 },
    record = { id: sha256("record"), documentId: id, output: "Original history", updatedAt: 12 },
    budget = { key: "budget", count: 1, bytes: 700 }
  await legacy.table("documents").put(document)
  await legacy.table("translations").put(record)
  await legacy.table("meta").put(budget)
  legacy.close()
  const upgraded = new PdfHistoryDatabase(name)
  try {
    expect(await upgraded.documents.get(id)).toEqual(document)
    expect(await upgraded.translations.toArray()).toEqual([record])
    expect(await upgraded.meta.get("budget")).toEqual(budget)
    expect(await upgraded.positions.count()).toBe(0)
    expect(await upgraded.positionEpochs.count()).toBe(0)
  } finally {
    await upgraded.delete()
  }
})
