import { sha256 } from "js-sha256"
export interface PdfTextBox {
  text: string
  x: number
  y: number
  width: number
  height: number
  dir?: string
}
export interface PdfParagraph {
  id: string
  page: number
  index: number
  text: string
  x: number
  y: number
  width: number
  height: number
}
export interface PdfParagraphPage {
  page: number
  paragraphs: PdfParagraph[]
  message: string
}
export const MAX_PDF_PARAGRAPHS = 120
export const MAX_PDF_PAGE_CHARS = 100000
export const MAX_PDF_TEXT_BOXES = 6000
interface Line extends PdfTextBox {
  column: number
}
function joinBoxes(boxes: PdfTextBox[]) {
  const rtl = boxes.filter((box) => box.dir === "rtl").length > boxes.length / 2
  boxes.sort((a, b) => (rtl ? b.x - a.x : a.x - b.x))
  let output = ""
  for (let i = 0; i < boxes.length; i++) {
    const item = boxes[i]!,
      previous = boxes[i - 1]
    if (previous) {
      const gap = rtl ? previous.x - item.x - item.width : item.x - previous.x - previous.width
      if (
        (/\s$/u.test(previous.text) ||
          /^\s/u.test(item.text) ||
          gap > Math.min(item.height, previous.height) * 0.08) &&
        !/^[,.;:!?、。，；：！？)\]}]/u.test(item.text.trim()) &&
        !/[([{]$/u.test(output)
      )
        output += " "
    }
    output += item.text.trim()
  }
  return output
}
/** Layout inference only; original canvas/text-layer DOM is never rewritten. Coordinates are normalized. */
export function extractPdfParagraphs(
  items: PdfTextBox[],
  width: number,
  height: number,
  page: number,
): PdfParagraphPage {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    items.length > MAX_PDF_TEXT_BOXES
  )
    return {
      page,
      paragraphs: [],
      message: "Trang quá phức tạp để ghép đoạn tự động. Hãy bôi đen hoặc chụp vùng cần dịch.",
    }
  const boxes = items
    .filter(
      (item) =>
        item.text.trim() &&
        [item.x, item.y, item.width, item.height].every(Number.isFinite) &&
        item.width > 0 &&
        item.height > 0 &&
        item.x < width &&
        item.y < height &&
        item.x + item.width > 0 &&
        item.y + item.height > 0,
    )
    .sort((a, b) => a.y - b.y || a.x - b.x)
  if (boxes.reduce((sum, box) => sum + box.text.length, 0) > MAX_PDF_PAGE_CHARS)
    return {
      page,
      paragraphs: [],
      message: "Trang có quá nhiều chữ. Hãy chọn vùng nhỏ hơn để dịch.",
    }
  if (!boxes.length)
    return {
      page,
      paragraphs: [],
      message: "Trang không có lớp chữ đọc được. Dùng Chụp vùng & dịch ảnh cho PDF scan.",
    }
  const rows: PdfTextBox[][] = []
  for (const item of boxes) {
    const row = rows.at(-1),
      first = row?.[0]
    if (
      first &&
      Math.abs(item.y + item.height * 0.5 - first.y - first.height * 0.5) <=
        Math.max(item.height, first.height) * 0.45
    )
      row.push(item)
    else rows.push([item])
  }
  const lines: Line[] = []
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x)
    const groups: PdfTextBox[][] = []
    for (const item of row) {
      const previous = groups.at(-1)?.at(-1)
      if (
        previous &&
        item.x - previous.x - previous.width <= Math.max(item.height * 2.8, width * 0.035)
      )
        groups.at(-1)!.push(item)
      else groups.push([item])
    }
    for (const group of groups) {
      const x = Math.min(...group.map((box) => box.x)),
        y = Math.min(...group.map((box) => box.y)),
        right = Math.max(...group.map((box) => box.x + box.width)),
        bottom = Math.max(...group.map((box) => box.y + box.height))
      lines.push({ x, y, width: right - x, height: bottom - y, text: joinBoxes(group), column: 0 })
    }
  }
  const left = lines.filter((line) => line.x + line.width < width * 0.52),
    right = lines.filter((line) => line.x > width * 0.48)
  const pairedRows = left.filter((line) =>
    right.some((other) => Math.abs(line.y - other.y) < Math.max(line.height, other.height)),
  )
  const columns = left.length >= 3 && right.length >= 3 && pairedRows.length >= 3
  if (columns) {
    for (const line of lines)
      line.column = line.x > width * 0.48 ? 2 : line.x + line.width < width * 0.52 ? 1 : 0
    const headings = lines.filter((line) => !line.column).sort((a, b) => a.y - b.y)
    const band = (line: Line) =>
      headings.filter((heading) => heading.y < line.y - line.height * 0.3).length
    lines.sort(
      (a, b) =>
        band(a) - band(b) ||
        (a.column === 0 || b.column === 0 ? a.y - b.y : a.column - b.column || a.y - b.y),
    )
  } else lines.sort((a, b) => a.y - b.y || a.x - b.x)
  const paragraphs: Line[][] = []
  for (const line of lines) {
    const group = paragraphs.at(-1),
      previous = group?.at(-1)
    const startsList = /^(?:[-•▪◦*]|\d+[.)]|[A-Za-z][.)])\s/u.test(line.text)
    const canJoin =
      previous &&
      previous.column === line.column &&
      line.y > previous.y + previous.height * 0.3 &&
      line.y - previous.y < Math.max(previous.height, line.height) * 1.85 &&
      Math.abs(previous.height - line.height) < Math.max(previous.height, line.height) * 0.3 &&
      Math.abs(line.x - group![0]!.x) < Math.max(line.height * 1.6, width * 0.025) &&
      !startsList &&
      group!.reduce((sum, item) => sum + item.text.length + 1, 0) + line.text.length <= 20000
    if (canJoin) group!.push(line)
    else paragraphs.push([line])
  }
  if (
    paragraphs.length > MAX_PDF_PARAGRAPHS ||
    paragraphs.some((group) => group.some((line) => line.text.length > 20000))
  )
    return {
      page,
      paragraphs: [],
      message: "Trang có quá nhiều đoạn hoặc một đoạn quá dài. Hãy bôi đen vùng nhỏ hơn.",
    }
  return {
    page,
    message: columns
      ? "Đã nhận diện hai cột; kiểm tra thứ tự đoạn trước khi dịch."
      : "Đoạn được nhận diện từ vị trí chữ. Với bảng/công thức, có thể bôi đen để chọn chính xác hơn.",
    paragraphs: paragraphs.map((group, index) => {
      const text = group
          .map((line) => line.text)
          .join("\n")
          .normalize("NFC"),
        x = Math.max(0, Math.min(...group.map((line) => line.x))),
        y = Math.max(0, Math.min(...group.map((line) => line.y))),
        rightEdge = Math.min(width, Math.max(...group.map((line) => line.x + line.width))),
        bottom = Math.min(height, Math.max(...group.map((line) => line.y + line.height)))
      return {
        id: `${page}-${sha256(JSON.stringify([index, text])).slice(0, 24)}`,
        page,
        index,
        text,
        x: x / width,
        y: y / height,
        width: (rightEdge - x) / width,
        height: (bottom - y) / height,
      }
    }),
  }
}
export function paragraphAt(paragraphs: PdfParagraph[], y: number) {
  return paragraphs.reduce<PdfParagraph | null>((best, item) => {
    const distance =
      y < item.y ? item.y - y : y > item.y + item.height ? y - item.y - item.height : 0
    const bestDistance = !best
      ? Infinity
      : y < best.y
        ? best.y - y
        : y > best.y + best.height
          ? y - best.y - best.height
          : 0
    return distance < bestDistance ? item : best
  }, null)
}
