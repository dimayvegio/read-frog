import type { PdfParagraph } from "../paragraphs"
import { expect, it, vi } from "vitest"
import { mergeSelectedParagraphs } from "../paragraph-selection"
import { listRecentPdfs, recentFilesDB, rememberPdf } from "../recent-files"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
it("keeps twenty local metadata entries without storing PDF bytes or paths, and upserts identity", async () => {
  for (let n = 0; n < 25; n++)
    await rememberPdf(
      n.toString(16).padStart(64, "0"),
      `C:\\private\\guide-${n}.pdf`,
      1000,
      undefined,
      () => true,
    )
  const rows = await listRecentPdfs()
  expect(rows).toHaveLength(20)
  expect(
    rows.every(
      (row) =>
        Object.keys(row).every((key) => ["id", "title", "size", "openedAt"].includes(key)) &&
        !row.title.includes("private"),
    ),
  ).toBe(true)
  await rememberPdf(rows[0]!.id, "renamed.pdf", 1000, undefined, () => true)
  expect((await listRecentPdfs()).filter((row) => row.id === rows[0]!.id)).toHaveLength(1)
  await rememberPdf("f".repeat(64), "canceled.pdf", 1000, undefined, () => false)
  expect(await recentFilesDB.files.get("f".repeat(64))).toBeUndefined()
})
it("merges contiguous selection in source order, preserves newlines, rejects gaps", () => {
  const items = Array.from({ length: 5 }, (_, i) => ({
    id: `p${i}`,
    page: 1,
    index: i,
    text: `Line ${i}`,
    x: 0.1,
    y: 0.1 + i * 0.1,
    width: 0.5,
    height: 0.05,
  })) as PdfParagraph[]
  const merged = mergeSelectedParagraphs(items, ["p3", "p1", "p2"])
  expect(merged.map((p) => p.text)).toEqual(["Line 0", "Line 1\nLine 2\nLine 3", "Line 4"])
  expect(() => mergeSelectedParagraphs(items, ["p1", "p3"])).toThrow(/liền nhau/)
  expect(items).toHaveLength(5)
})
