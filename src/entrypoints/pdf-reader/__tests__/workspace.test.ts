import type { PdfParagraph } from "../paragraphs"
import { expect, it, vi } from "vitest"
import { mergeParagraphs, splitParagraph, paragraphSource } from "../paragraph-edits"
import {
  emptyWorkspace,
  loadWorkspace,
  saveWorkspace,
  validateWorkspace,
  PdfWorkspace,
} from "../workspace"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
const bookmark = {
  id: "one",
  name: "Chương cần ôn",
  note: "Đọc lại 日本語",
  color: "#42a5f5",
  page: 3,
  offset: 0.35,
  zoom: 1.5 as const,
}
it("stores exact bookmark position/style by content hash and rejects stale windows", async () => {
  const before = await loadWorkspace("c".repeat(64)),
    stale = await loadWorkspace(before.id)
  const next = await saveWorkspace(before, {
    ...before,
    bookmarks: [bookmark],
    styles: { shape: { width: 6, opacity: 0.5, fill: "#66bb6a" } },
  })
  expect(await loadWorkspace(before.id)).toEqual(next)
  expect((await loadWorkspace("d".repeat(64))).bookmarks).toEqual([])
  await expect(saveWorkspace(stale, stale)).rejects.toThrow(/cửa sổ khác/)
})
it("cancels a late save without creating a record", async () => {
  const before = await loadWorkspace("e".repeat(64))
  let active = true
  const saving = saveWorkspace(before, { ...before, bookmarks: [bookmark] }, () => active)
  active = false
  await expect(saving).rejects.toThrow(/đã dừng/)
  expect(await loadWorkspace(before.id)).toEqual(before)
})
it("rejects unbounded and malformed bookmark, style and paragraph metadata", () => {
  const base = emptyWorkspace("a".repeat(64))
  for (const patch of [
    { bookmarks: [{ ...bookmark, offset: NaN }] },
    { bookmarks: [{ ...bookmark, zoom: Infinity }] },
    { bookmarks: [bookmark, bookmark] },
    { styles: { shape: { width: 9, opacity: 1, fill: "none" } } },
    { styles: { shape: { width: 2, opacity: 0, fill: "none" } } },
    { styles: { shape: { width: 2, opacity: 1, fill: "url(x)" } } },
  ])
    expect(() => validateWorkspace({ ...base, ...patch })).toThrow(/không hợp lệ|liền nhau|con trỏ/)
})
it("shares chronological undo/redo between annotation commands and metadata, without losing bookmarks", async () => {
  const workspace = new PdfWorkspace("f".repeat(64))
  await vi.waitFor(() => expect(workspace.getSnapshot().ready).toBe(true))
  let geometry = 0
  await workspace.edit((d) => ({ ...d, bookmarks: [bookmark] }))
  await workspace.perform(async () => {
    geometry = 1
    return {
      undo: async () => {
        geometry = 0
        return true
      },
      redo: async () => {
        geometry = 1
        return true
      },
    }
  })
  await workspace.edit((d) => ({ ...d, styles: { shape: { width: 4, opacity: 1, fill: "none" } } }))
  expect(await workspace.reverse("undo")).toBe(true)
  expect(workspace.getSnapshot().data.bookmarks).toEqual([bookmark])
  expect(workspace.getSnapshot().data.styles).toEqual({})
  await workspace.reverse("undo")
  expect(geometry).toBe(0)
  await workspace.reverse("redo")
  expect(geometry).toBe(1)
  await workspace.reverse("redo")
  expect(workspace.getSnapshot().data.styles.shape?.width).toBe(4)
  workspace.destroy()
  expect(await workspace.edit((d) => ({ ...d, bookmarks: [] }))).toBe(false)
})
const paragraphs: PdfParagraph[] = [
  {
    id: "p1",
    page: 1,
    index: 0,
    text: "First line.\nSecond line.",
    x: 0.1,
    y: 0.1,
    width: 0.7,
    height: 0.1,
  },
  {
    id: "p2",
    page: 1,
    index: 1,
    text: "Next paragraph.",
    x: 0.1,
    y: 0.3,
    width: 0.7,
    height: 0.05,
  },
]
it("merges adjacent paragraphs while preserving order, source text and bounded geometry", () => {
  const merged = mergeParagraphs(paragraphs, "p1")
  expect(merged).toHaveLength(1)
  expect(merged[0]!.text).toBe("First line.\nSecond line.\nNext paragraph.")
  expect(merged[0]!.height).toBeCloseTo(0.25)
  expect(paragraphs).toHaveLength(2)
  expect(() =>
    mergeParagraphs([{ ...paragraphs[0]!, excluded: true }, paragraphs[1]!], "p1"),
  ).toThrow(/không hợp lệ|liền nhau|con trỏ/)
})
it("splits at a grapheme boundary without losing text and rejects empty/oversized edits", () => {
  const parts = splitParagraph(paragraphs, "p1", 12)
  expect(parts.map((p) => p.text)).toEqual(["First line.", "Second line.", "Next paragraph."])
  expect(parts.map((p) => p.index)).toEqual([0, 1, 2])
  const emoji = { ...paragraphs[0]!, text: "A 👩‍💻 B" }
  const split = splitParagraph([emoji], "p1", 5)
  expect(split.map((p) => p.text)).toEqual(["A", "👩‍💻 B"])
  expect(() => splitParagraph(paragraphs, "p1", 0)).toThrow(/không hợp lệ|liền nhau|con trỏ/)
  expect(() => splitParagraph(paragraphs, "p1", 1000)).toThrow(/không hợp lệ|liền nhau|con trỏ/)
})
it("uses text identity rather than zoom geometry to detect stale manual layouts", () => {
  expect(paragraphSource(paragraphs)).toBe(
    paragraphSource(paragraphs.map((p) => ({ ...p, x: p.x + 0.001 }))),
  )
  expect(paragraphSource(paragraphs)).not.toBe(
    paragraphSource(paragraphs.map((p) => ({ ...p, text: p.text + " OCR changed" }))),
  )
})
