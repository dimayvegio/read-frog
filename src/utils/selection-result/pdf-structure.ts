import type { PdfTextOptions } from "./pdf-text"
export const PDF_STRUCTURE_ID = "pdf-layout-cells-v1"
export const prepareStructuredPdfText = (raw: string, options: PdfTextOptions) => {
  const value = raw.replace(/\r\n?/gu, "\n")
  return options.clean ? value.normalize("NFC").replace(/\u00ad/gu, "") : value
}
export const PDF_STRUCTURE_RULES =
  "Preserve source structure exactly: never merge, split, reorder or invent source lines, paragraphs, list items or table rows/cells. Preserve code, identifiers, bus ranges, literals, units, formulae and indentation. Translate in place, without summaries, headings or explanatory additions."
export function pdfStructureEnvelope(text: string) {
  const units: { id: number; text: string }[] = [],
    rows = text.split("\n").map((line) =>
      line.split(/(\t+| {2,})/u).map((part) => {
        if (!part.trim()) return { literal: part }
        const id = units.length,
          prefix = part.match(/^\s*/u)![0],
          suffix = part.match(/\s*$/u)![0]
        units.push({ id, text: part.trim() })
        return { id, prefix, suffix }
      }),
    )
  if (units.length > 1000) throw new Error("Chọn ít hơn 1.000 ô/dòng mỗi đoạn dịch.")
  const assemble = (values: Map<number, string>) =>
    rows
      .map((row) =>
        row
          .map((cell) =>
            "literal" in cell
              ? cell.literal
              : `${cell.prefix}${values.get(cell.id) ?? ""}${cell.suffix}`,
          )
          .join(""),
      )
      .join("\n")
  const decode = (raw: string, partial = false) => {
    if (raw.length > 180000) throw new Error("Bản dịch vượt giới hạn cấu trúc.")
    const values = new Map<number, string>()
    if (partial) {
      for (const m of raw.matchAll(/"id"\s*:\s*(\d+)\s*,\s*"text"\s*:\s*("(?:\\.|[^"\\])*")/gu)) {
        try {
          const id = Number(m[1]),
            value = JSON.parse(m[2]!) as unknown
          if (id < units.length && typeof value === "string" && !/[\r\n\t]/u.test(value))
            values.set(id, value.trim())
        } catch {
          /* Wait for complete JSON strings. */
        }
      }
      return values.size ? assemble(values).trimEnd() : ""
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(
        raw
          .trim()
          .replace(/^```(?:json)?\s*\n?/u, "")
          .replace(/\n?```$/u, ""),
      )
    } catch {
      throw new Error(
        "Bản dịch chưa đúng cấu trúc dòng/ô. Chưa lưu cache; bạn có thể bấm Dịch lại.",
      )
    }
    const lines = (parsed as { lines?: unknown })?.lines
    if (!Array.isArray(lines) || lines.length !== units.length)
      throw new Error("Bản dịch làm thay đổi số dòng/ô; đã dừng để giữ cấu trúc nguồn.")
    for (const line of lines) {
      if (
        !line ||
        !Number.isInteger(line.id) ||
        line.id < 0 ||
        line.id >= units.length ||
        values.has(line.id) ||
        typeof line.text !== "string" ||
        /[\r\n\t]/u.test(line.text) ||
        !line.text.trim()
      )
        throw new Error("Bản dịch sai vị trí dòng/ô; chưa lưu kết quả này.")
      values.set(line.id, line.text.trim())
    }
    const output = assemble(values)
    if (output.length > 60000) throw new Error("Bản dịch vượt giới hạn.")
    return output
  }
  return { input: JSON.stringify({ lines: units }), decode }
}
