import { describe, expect, it, vi } from "vitest"
import {
  joinPdfRuns,
  loadStudy,
  saveStudy,
  searchText,
  validateStudy,
  type Annotation,
  type StudyDocument,
} from "../study-data"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
const annotation = (id = "highlight"): Annotation => ({
  id,
  kind: "highlight",
  page: 1,
  color: "#ffca28",
  boxes: [{ x: 0.1, y: 0.2, width: 0.5, height: 0.03 }],
  points: [],
  text: "A useful paragraph.",
})
describe("PDF study DB1 transactions", () => {
  it("persists content-keyed highlights and rejects cross-tab overwrites and resurrection after clear", async () => {
    const a = await loadStudy("a".repeat(64)),
      b = await loadStudy(a.id)
    const saved = await saveStudy(a, { ...a, annotations: [annotation()] })
    expect((await loadStudy(a.id)).annotations).toEqual([annotation()])
    await expect(saveStudy(b, { ...b, annotations: [annotation("other-tab")] })).rejects.toThrow(
      /cửa sổ khác/,
    )
    const cleared = await saveStudy(saved, { ...saved, annotations: [], ocr: [] })
    expect(cleared.revision).toBe(2)
    await expect(saveStudy(saved, saved)).rejects.toThrow(/cửa sổ khác/)
    expect((await loadStudy(a.id)).annotations).toEqual([])
  })
  it("aborts an in-flight OCR save if its page/file ownership is cancelled", async () => {
    const previous = await loadStudy("e".repeat(64))
    let active = true
    const saving = saveStudy(
      previous,
      {
        ...previous,
        ocr: [
          {
            page: 1,
            engine: "tesseract7-int-v1",
            language: "eng",
            words: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.03, text: "Late OCR" }],
          },
        ],
      },
      () => active,
    )
    active = false
    await expect(saving).rejects.toThrow(/OCR muộn/)
    expect((await loadStudy(previous.id)).ocr).toEqual([])
  })
  it("saves only text/normalized OCR geometry, separately from annotations and other documents", async () => {
    const a = await loadStudy("b".repeat(64)),
      b = await loadStudy("c".repeat(64))
    const ocr: StudyDocument["ocr"] = [
      {
        page: 3,
        engine: "tesseract7-int-v1",
        language: "vie",
        words: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.05, text: "Tiếng Việt" }],
      },
    ]
    await saveStudy(a, { ...a, ocr, annotations: [annotation()] })
    expect((await loadStudy(a.id)).ocr).toEqual(ocr)
    expect(await loadStudy(b.id)).toEqual(b)
  })
  it("rejects invalid geometry, duplicate IDs and bounded oversized documents without partial writes", async () => {
    const a = await loadStudy("d".repeat(64))
    await expect(saveStudy(a, { ...a, annotations: [annotation(), annotation()] })).rejects.toThrow(
      /hợp lệ/,
    )
    expect(() =>
      validateStudy({ ...a, annotations: [{ ...annotation(), points: [{ x: NaN, y: 0.2 }] }] }),
    ).toThrow(/hợp lệ/)
    expect(() =>
      validateStudy({
        ...a,
        annotations: [{ ...annotation(), boxes: [{ x: 0.9, y: 0.1, width: 0.5, height: 0.1 }] }],
      }),
    ).toThrow(/hợp lệ/)
    expect(() =>
      validateStudy({
        ...a,
        ocr: Array.from({ length: 21 }, (_, i) => ({
          page: i + 1,
          engine: "tesseract7-int-v1",
          language: "eng",
          words: [],
        })),
      }),
    ).toThrow(/20/)
    expect((await loadStudy(a.id)).revision).toBe(0)
  })
})
describe("literal/wildcard PDF search", () => {
  it("finds every occurrence, normalizes whitespace and NFC, and ignores case", () => {
    expect(searchText("Tiếng\n  Việt và TIẾNG VIỆT", "tiếng việt")).toHaveLength(2)
    expect(searchText("abc abc abc", "abc")).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
      { start: 8, end: 11 },
    ])
  })
  it("supports abx*xyz and several wildcard fragments with literal punctuation", () => {
    expect(searchText("abx first xyz; abx\nsecond xyz", "ABX*XYZ")).toEqual([
      { start: 0, end: 13 },
      { start: 15, end: 29 },
    ])
    expect(searchText("a.b+middle[z]end a.b+NEXT[z]end", "a.b+*[z]*end")).toHaveLength(2)
    expect(searchText("abc", "***")).toEqual([])
    expect(searchText("abx end xyz", "abx*missing*xyz")).toEqual([])
  })
  it("joins OCR CJK words without artificial spaces while keeping Latin word boundaries", () => {
    expect(joinPdfRuns(["每", "天", "学", "习", "中文", "。"]).trim()).toBe("每天学习中文。")
    expect(joinPdfRuns(["毎日", "日本語", "を", "勉強", "します"])).toBe("毎日日本語を勉強します")
    expect(searchText(joinPdfRuns(["每", "天", "学", "习"]), "学习")).toEqual([
      { start: 2, end: 4 },
    ])
    expect(joinPdfRuns(["Learning", "", "English", "every day"])).toBe("Learning English every day")
  })
  it("bounds result and query sizes without evaluating user regular expressions", () => {
    expect(searchText("a ".repeat(5000), "a")).toHaveLength(100)
    expect(searchText("a ".repeat(5000), "a*".repeat(101))).toEqual([])
    expect(searchText("a".repeat(100000), "(a+)+$")).toEqual([])
  })
})
