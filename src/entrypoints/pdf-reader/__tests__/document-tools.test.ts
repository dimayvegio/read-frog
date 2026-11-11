import { expect, it } from "vitest"
import {
  pdfStructureEnvelope,
  prepareStructuredPdfText,
} from "@/utils/selection-result/pdf-structure"
import { parsePdfPages } from "../extract-pages"
import { readPageRange } from "../page-range"
import { createPdfSourceMatcher, DEFAULT_PDF_SEARCH as base } from "../search"

it("deduplicates overlapping ranges and preserves explicit order without touching source pages", () => {
  expect(parsePdfPages("1-10, 3-30", 134)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1))
  expect(parsePdfPages("7; 1–3, 2 9", 10)).toEqual([7, 1, 2, 3, 9])
  for (const text of ["", "0", "4-2", "1-11", "NaN", "1e2", "1.2", "1--2", "1-2bad"])
    expect(() => parsePdfPages(text, 10)).toThrow(/trang|dòng|cấu trúc|vị trí/iu)
  expect(() => parsePdfPages("1-2001", 20000)).toThrow(/2.000/)
  expect(readPageRange("", "", 10000, 100, 9300)).toEqual({ first: 9300, last: 9300 })
  expect(() => readPageRange("1", "101", 1000, 100)).toThrow(/trang|dòng|cấu trúc|vị trí/iu)
})
it("finds literal SystemVerilog identifiers, buses and numeric literals", () => {
  const source = "uvm_test_top.env.agent data[31:0] 8'hFF VDD_CORE VDD_CORE2 a*b"
  for (const query of ["uvm_test_top.env.agent", "data[31:0]", "8'hFF", "a*b"])
    expect(
      createPdfSourceMatcher(query, { ...base, wildcards: false, caseSensitive: true })(source),
    ).toHaveLength(1)
  expect(createPdfSourceMatcher("VDD_CORE", { ...base, wholeWord: true })(source)).toHaveLength(1)
  expect(createPdfSourceMatcher("vdd_core", { ...base, caseSensitive: true })(source)).toHaveLength(
    0,
  )
})
it("maps accent/space-insensitive and AND proximity matches back onto original text", () => {
  const text = "Điện áp VDD _ CORE\nĐiện áp khác"
  const found = createPdfSourceMatcher("dien ap", { ...base, ignoreAccents: true })(text)
  expect(found.map((m) => text.slice(m.start, m.end))).toEqual(["Điện áp", "Điện áp"])
  expect(
    createPdfSourceMatcher("VDD_CORE", { ...base, ignoreSpaces: true, wholeWord: true })(text).map(
      (m) => text.slice(m.start, m.end),
    ),
  ).toEqual(["VDD _ CORE"])
  expect(
    createPdfSourceMatcher("alpha beta", { ...base, mode: "all", near: 20 })("alpha short beta"),
  ).toHaveLength(2)
  expect(
    createPdfSourceMatcher("alpha beta", { ...base, mode: "all", near: 20 })(
      "alpha" + "x".repeat(30) + "beta",
    ),
  ).toHaveLength(0)
  expect(createPdfSourceMatcher("alpha beta", { ...base, mode: "any" })("beta")).toHaveLength(1)
  expect(createPdfSourceMatcher("abx*xyz")("abx middle xyz")).toEqual([{ start: 0, end: 14 }])
})
it("locally preserves every row, table cell separator and indentation in translated PDF text", () => {
  const source = "Title\n\n  • First item\nName\tValue\nVDD_CORE  1.0 V"
  const envelope = pdfStructureEnvelope(source)
  const units = JSON.parse(envelope.input).lines
  const result = envelope.decode(
    JSON.stringify({
      lines: units.map((u: { id: number }) => ({ id: u.id, text: `Dịch ${u.id}` })),
    }),
  )
  expect(result).toBe("Dịch 0\n\n  Dịch 1\nDịch 2\tDịch 3\nDịch 4  Dịch 5")
  expect(envelope.decode('{"lines":[{"id":0,"text":"Tiêu đề"},', true)).toContain("Tiêu đề")
  for (const lines of [
    [],
    [{ id: 0, text: "merged" }],
    units.map(() => ({ id: 0, text: "duplicate" })),
    units.map((u: { id: number }) => ({ id: u.id, text: "new\nrow" })),
  ])
    expect(() => envelope.decode(JSON.stringify({ lines }))).toThrow(/trang|dòng|cấu trúc|vị trí/iu)
  expect(
    prepareStructuredPdfText("infra-\nstructure", { clean: true, joinHyphenatedWords: true }),
  ).toBe("infra-\nstructure")
})
