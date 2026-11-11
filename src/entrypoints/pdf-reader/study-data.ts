import { Dexie, type Table } from "dexie"

export type Point = { x: number; y: number }
export type Box = Point & { width: number; height: number }
export const STUDY_COLORS = ["#ffca28", "#66bb6a", "#42a5f5", "#ef5350"] as const
export type Annotation = {
  id: string
  page: number
  kind: "highlight" | "ink" | "note"
  color: string
  boxes: Box[]
  points: Point[]
  text: string
}
export type OcrPage = {
  page: number
  language: string
  engine: "tesseract7-int-v1"
  words: (Box & { text: string })[]
}
export type StudyDocument = {
  id: string
  revision: number
  annotations: Annotation[]
  ocr: OcrPage[]
}
const coordinate = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1
export function validBox(b: Box) {
  return (
    coordinate(b.x) &&
    coordinate(b.y) &&
    b.width > 0 &&
    b.height > 0 &&
    coordinate(b.width) &&
    coordinate(b.height) &&
    b.x + b.width <= 1.001 &&
    b.y + b.height <= 1.001
  )
}
export function validateStudy(data: StudyDocument) {
  if (
    !/^[a-f0-9]{64}$/.test(data.id) ||
    !Number.isSafeInteger(data.revision) ||
    data.revision < 0 ||
    data.annotations.length > 2000 ||
    data.ocr.length > 20
  )
    throw new Error(
      "Vượt giới hạn: 2.000 chú thích hoặc 20 trang OCR/file. Hãy xuất bản PDF có chú thích hoặc xóa OCR cũ.",
    )
  const ids = new Set<string>()
  let points = 0
  for (const a of data.annotations) {
    points += a.points.length
    if (
      !a.id ||
      ids.has(a.id) ||
      !Number.isInteger(a.page) ||
      a.page < 1 ||
      a.page > 20000 ||
      !["highlight", "ink", "note"].includes(a.kind) ||
      !STUDY_COLORS.includes(a.color as (typeof STUDY_COLORS)[number]) ||
      a.text.length > 2000 ||
      a.boxes.length > 200 ||
      a.points.length > 4096 ||
      a.boxes.some((b) => !validBox(b)) ||
      a.points.some((p) => !coordinate(p.x) || !coordinate(p.y)) ||
      (a.kind === "highlight" && !a.boxes.length) ||
      (a.kind === "ink" && a.points.length < 2) ||
      (a.kind === "note" && (!a.points.length || !a.text.trim()))
    )
      throw new Error("Chú thích không hợp lệ.")
    ids.add(a.id)
  }
  if (points > 100000) throw new Error("Quá nhiều nét vẽ trong file; hãy xuất và bắt đầu bản mới.")
  const pages = new Set<number>()
  for (const page of data.ocr) {
    if (
      !Number.isInteger(page.page) ||
      page.page < 1 ||
      page.page > 20000 ||
      pages.has(page.page) ||
      page.engine !== "tesseract7-int-v1" ||
      !["eng", "vie", "chi_sim", "jpn"].includes(page.language) ||
      page.words.length > 6000 ||
      page.words.some((w) => !validBox(w) || !w.text.trim() || w.text.length > 500)
    )
      throw new Error("Dữ liệu OCR không hợp lệ hoặc trang quá nhiều chữ.")
    pages.add(page.page)
  }
  if (JSON.stringify(data).length > 8_000_000)
    throw new Error("Dữ liệu đọc vượt 8 MB/file. Xóa OCR cũ trước khi tiếp tục.")
  return data
}

// Independent DB1: never alters published PDF DB2, settings or vocabulary schemas.
class StudyDatabase extends Dexie {
  documents!: Table<StudyDocument, string>
  constructor() {
    super("read-frog-pdf-study")
    this.version(1).stores({ documents: "id" })
  }
}
const db = new StudyDatabase()
export async function loadStudy(id: string): Promise<StudyDocument> {
  const value = await db.documents.get(id)
  return validateStudy(value ?? { id, revision: 0, annotations: [], ocr: [] })
}
export async function saveStudy(
  previous: StudyDocument,
  next: StudyDocument,
  canCommit: () => boolean = () => true,
) {
  const check = () => {
    if (!canCommit()) throw new Error("Tác vụ đã dừng; không lưu kết quả OCR muộn.")
  }
  check()
  const value = validateStudy({ ...next, id: previous.id, revision: previous.revision + 1 })
  await db.transaction("rw", db.documents, async () => {
    const stored = await db.documents.get(previous.id)
    if ((stored?.revision ?? 0) !== previous.revision)
      throw new Error("File đang được sửa ở cửa sổ khác. Bấm Nạp lại chú thích rồi thử lại.")
    if (
      !(stored?.annotations.length || stored?.ocr.length) &&
      (value.annotations.length || value.ocr.length) &&
      (await db.documents.filter((d) => !!(d.annotations.length || d.ocr.length)).count()) >= 100
    )
      throw new Error("Đã lưu 100 tài liệu. Xóa dữ liệu tài liệu cũ trước khi thêm.")
    check()
    await db.documents.put(value)
    check()
  })
  return value
}

const cjkEnd = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u
const cjkStart = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}、。！？：；，]/u
export const pdfRunSeparator = (left: string, right: string) =>
  cjkEnd.test(left.trim()) && cjkStart.test(right.trim()) ? "" : " "
export const joinPdfRuns = (parts: string[]) => {
  const words = parts.map((part) => part.trim()).filter(Boolean)
  return words
    .map((part, index) => (index ? pdfRunSeparator(words[index - 1]!, part) : "") + part)
    .join("")
}

export const normalizePdfSearch = (s: string) =>
  s.normalize("NFC").replace(/\s+/gu, " ").toLocaleLowerCase()
export function searchText(text: string, query: string): { start: number; end: number }[] {
  const source = normalizePdfSearch(text),
    needle = normalizePdfSearch(query).trim()
  // Literal fragments, not user-controlled regular expressions. Greedy regexes
  // can freeze the UI on large PDFs; ordered indexOf scans stay bounded instead.
  const fragments = needle.split("*").filter(Boolean)
  if (!fragments.length || needle.length > 200) return []
  const matches: { start: number; end: number }[] = []
  let cursor = 0
  while (matches.length < 100) {
    const start = source.indexOf(fragments[0]!, cursor)
    if (start < 0) break
    let end = start + fragments[0]!.length,
      missing = false
    for (const fragment of fragments.slice(1)) {
      const next = source.indexOf(fragment, end)
      if (next < 0) {
        missing = true
        break
      }
      end = next + fragment.length
    }
    if (missing) break
    matches.push({ start, end })
    cursor = end
  }
  return matches
}
