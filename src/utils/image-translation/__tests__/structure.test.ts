import { expect, it } from "vitest"
import {
  imageStructureEnvelope,
  imageStructureSchema,
  parseImageStructure,
  renderImageStructure,
  type ImageStructure,
} from "../structure"

export const fixture: ImageStructure = {
  blocks: [
    { type: "heading", level: 2, text: "Registers" },
    { type: "paragraph", text: "First paragraph.\nSame paragraph." },
    { type: "paragraph", text: "Separate paragraph." },
    {
      type: "table",
      header: true,
      rows: [
        ["Name", "Value"],
        ["a|b", ""],
        ["rst_n", "1'b0"],
      ],
    },
    { type: "list", ordered: true, start: 8, items: ["First item", "Next item"] },
    {
      type: "code",
      language: "sv",
      text: "module test;\n  // ``` and ![x](https://example.org)\n  assign rst_n = 1'b0;\nendmodule",
    },
  ],
}
it("keeps block order, list numbering, table cells and literal code with a safe fence", () => {
  const doc = parseImageStructure(JSON.stringify(fixture))
  const output = renderImageStructure(doc)
  expect(output).toContain("## Registers\n\nFirst paragraph\\.  \nSame paragraph\\.")
  expect(output).toContain("8. First item\n9. Next item")
  expect(output).toContain("| a\\|b |  |")
  expect(output).toContain("````sv\nmodule test;\n  // ```")
  expect(output.indexOf("Separate paragraph")).toBeLessThan(output.indexOf("| Name"))
})
it("uses exact ids, excludes empty cells/code from translation and reassembles locally", () => {
  const env = imageStructureEnvelope(fixture)
  expect(env.cells.some((c) => c.id.startsWith("5/") || c.id === "3/r/1/1")).toBe(false)
  const output = env.decode(
    JSON.stringify({
      cells: env.cells.toReversed().map((c) => ({ id: c.id, text: `VI ${c.text}` })),
    }),
  )
  expect(output).toContain("| VI a\\|b |  |")
  expect(output).toContain(fixture.blocks[5]!.type === "code" ? fixture.blocks[5]!.text : "fail")
})
it.each(["missing", "duplicate", "extra", "newline", "empty", "malformed", "truncated"])(
  "rejects %s output without flattening or inventing cells",
  (kind) => {
    const env = imageStructureEnvelope(fixture)
    const cells = env.cells.map((c) => ({ ...c }))
    if (kind === "missing") cells.pop()
    if (kind === "duplicate") cells[1]!.id = cells[0]!.id
    if (kind === "extra") cells.push({ id: "999/text", text: "Extra" })
    if (kind === "newline") cells.find((c) => c.id.includes("/r/"))!.text = "New\nrow"
    if (kind === "empty") cells[0]!.text = " "
    const raw =
      kind === "malformed"
        ? "<script>bad</script>"
        : kind === "truncated"
          ? '{"cells":['
          : JSON.stringify({ cells })
    expect(() => env.decode(raw)).toThrow(/./u)
  },
)
it("does not create a fictitious source header for a headerless table", () => {
  const doc: ImageStructure = {
    blocks: [
      {
        type: "table",
        header: false,
        rows: [
          ["A", "B"],
          ["C", "D"],
        ],
      },
    ],
  }
  const env = imageStructureEnvelope(doc)
  expect(env.cells.map((c) => c.text)).toEqual(["A", "B", "C", "D"])
  expect(renderImageStructure(doc)).toContain("|   |   |\n| --- | --- |\n| A | B |")
})
it("keeps empty list entries local instead of asking AI to invent content", () => {
  const doc: ImageStructure = {
    blocks: [{ type: "list", ordered: false, start: 1, items: ["Visible", ""] }],
  }
  const env = imageStructureEnvelope(doc)
  expect(env.cells).toEqual([{ id: "0/i/0", text: "Visible" }])
  expect(env.decode('{"cells":[{"id":"0/i/0","text":"Hiển thị"}]}')).toBe("- Hiển thị\n- ")
})
it("escapes links/images/HTML and Markdown in text cells", () => {
  const output = renderImageStructure({
    blocks: [{ type: "paragraph", text: '<img src="https://bad"> ![bad](https://bad) **wrong**' }],
  })
  expect(output).toContain('\\<img src="https://bad"\\>')
  expect(output).toContain("\\!\\[bad\\]\\(https://bad\\)")
})
it.each([
  { blocks: [{ type: "table", header: true, rows: [["a", "b"], ["c"]] }] },
  { blocks: [{ type: "table", header: false, rows: [["a\nb"]] }] },
  { blocks: [{ type: "code", language: 'x" onmouseover="', text: "x" }] },
  { blocks: [{ type: "heading", level: 7, text: "Bad" }] },
  { blocks: new Array(129).fill({ type: "paragraph", text: "x" }) },
  { blocks: [{ type: "paragraph", text: "x".repeat(20000) }] },
  { blocks: [{ type: "paragraph", text: "x", url: "https://bad" }] },
  { blocks: [] },
])("rejects invalid/oversized/untrusted source shapes", (doc) => {
  expect(imageStructureSchema.safeParse(doc).success).toBe(false)
  expect(() => parseImageStructure(JSON.stringify(doc))).toThrow(/./u)
})
