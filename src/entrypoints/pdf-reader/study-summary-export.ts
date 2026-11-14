export interface StudySummaryBookmark {
  page: number
  name: string
  note: string
  color: string
}

export interface StudySummaryTextNote {
  page: number
  text: string
  color: string
}

export interface StudySummaryAnnotation {
  page: number
  kind: string
  text?: string
  color: string
}

export interface StudySummaryTranslation {
  original: string
  output: string
  targetLanguage: string
  updatedAt: number
}

export interface StudySummaryVocabulary {
  word: string
  ipa?: string
  meaning?: string
  context?: string
}

export interface StudySummaryExportData {
  documentId: string
  title: string
  numPages: number
  bookmarks: StudySummaryBookmark[]
  textNotes: StudySummaryTextNote[]
  annotations: StudySummaryAnnotation[]
  translations: StudySummaryTranslation[]
  vocabularyWords: StudySummaryVocabulary[]
}

export function buildStudySummaryMarkdown(data: StudySummaryExportData): string {
  const dateStr = new Date().toLocaleString("vi-VN")
  const lines: string[] = []

  // Document Title & Metadata Header
  lines.push(`# 📚 Báo cáo học tập & Ghi chú PDF`)
  lines.push(``)
  lines.push(`- **Tài liệu:** ${data.title}`)
  lines.push(`- **Tổng số trang:** ${data.numPages} trang`)
  lines.push(`- **Thời gian xuất:** ${dateStr}`)
  lines.push(`- **Mã tài liệu (ID):** \`${data.documentId.slice(0, 16)}...\``)
  lines.push(``)
  lines.push(`---`)
  lines.push(``)

  // 1. Bookmarks Section
  lines.push(`## 🔖 1. Danh sách Bookmark đã đánh dấu (${data.bookmarks.length})`)
  lines.push(``)
  if (data.bookmarks.length === 0) {
    lines.push(`_Chưa có bookmark nào được lưu trong tài liệu này._`)
  } else {
    lines.push(`| Trang | Tên Bookmark | Ghi chú |`)
    lines.push(`| :---: | :--- | :--- |`)
    for (const bm of data.bookmarks) {
      const cleanName = (bm.name || `Trang ${bm.page}`).replace(/\|/g, "\\|")
      const cleanNote = (bm.note || "-").replace(/\|/g, "\\|").replace(/\n/g, " ")
      lines.push(`| **${bm.page}** | ${cleanName} | ${cleanNote} |`)
    }
  }
  lines.push(``)
  lines.push(`---`)
  lines.push(``)

  // 2. Notes & Annotations Section
  const allNotes = [
    ...data.textNotes.map((n) => ({ page: n.page, type: "Ô chữ chú thích", text: n.text })),
    ...data.annotations
      .filter((a) => a.kind === "note" && a.text)
      .map((a) => ({ page: a.page, type: "Ghi chú gắn kèm", text: a.text! })),
  ].sort((a, b) => a.page - b.page)

  lines.push(`## 📝 2. Ghi chú & Chú thích trên trang (${allNotes.length})`)
  lines.push(``)
  if (allNotes.length === 0) {
    lines.push(`_Chưa có ghi chú hoặc ô chữ chú thích nào trong tài liệu này._`)
  } else {
    let currentPage = -1
    for (const note of allNotes) {
      if (note.page !== currentPage) {
        currentPage = note.page
        lines.push(`### Trang ${currentPage}`)
      }
      lines.push(`- **[${note.type}]**: ${note.text.trim()}`)
    }
  }
  lines.push(``)
  lines.push(`---`)
  lines.push(``)

  // 3. Translation History Section
  lines.push(`## 🌐 3. Các đoạn văn bản đã dịch (${data.translations.length})`)
  lines.push(``)
  if (data.translations.length === 0) {
    lines.push(`_Chưa có đoạn dịch nào được lưu trong lịch sử tài liệu này._`)
  } else {
    data.translations.forEach((t, index) => {
      lines.push(`#### Đoạn ${index + 1} (${t.targetLanguage || "Tiếng Việt"})`)
      lines.push(`> ${t.original.replace(/\n+/g, " ")}`)
      lines.push(``)
      lines.push(`**Bản dịch:**`)
      lines.push(t.output)
      lines.push(``)
    })
  }
  lines.push(`---`)
  lines.push(``)

  // 4. Saved Vocabulary Section
  lines.push(`## 📖 4. Từ vựng đã lưu vào sổ từ (${data.vocabularyWords.length})`)
  lines.push(``)
  if (data.vocabularyWords.length === 0) {
    lines.push(`_Chưa có từ vựng nào được lưu từ tài liệu này vào Sổ từ._`)
  } else {
    lines.push(`| Từ vựng | Phiên âm | Nghĩa tiếng Việt | Câu ngữ cảnh |`)
    lines.push(`| :--- | :--- | :--- | :--- |`)
    for (const v of data.vocabularyWords) {
      const cleanWord = (v.word || "").replace(/\|/g, "\\|")
      const cleanIpa = (v.ipa || "-").replace(/\|/g, "\\|")
      const cleanMeaning = (v.meaning || "-").replace(/\|/g, "\\|").replace(/\n/g, " ")
      const cleanContext = (v.context || "-").replace(/\|/g, "\\|").replace(/\n/g, " ")
      lines.push(`| **${cleanWord}** | \`${cleanIpa}\` | ${cleanMeaning} | ${cleanContext} |`)
    }
  }
  lines.push(``)

  return lines.join("\n")
}

export function exportStudySummaryFile(data: StudySummaryExportData): void {
  const md = buildStudySummaryMarkdown(data)
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const safeName = data.title.replace(/[\\/:*?"<>|]/g, "-").trim() || "Tai-lieu"
  const a = document.createElement("a")
  a.href = url
  a.download = `${safeName}-GhiChuHocTap.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
