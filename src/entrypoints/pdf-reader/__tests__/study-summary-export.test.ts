import { describe, expect, it } from "vitest"
import { buildStudySummaryMarkdown, type StudySummaryExportData } from "../study-summary-export"

describe("Study Summary Export (.md)", () => {
  it("formats study summary into clean markdown document", () => {
    const data: StudySummaryExportData = {
      documentId: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      title: "JEDEC Standard 251C.pdf",
      numPages: 84,
      bookmarks: [
        { page: 65, name: "Driver Type Selection", note: "Quan trọng", color: "#42a5f5" },
      ],
      textNotes: [{ page: 65, text: "Chú ý cấu hình register SFDP", color: "#ffca28" }],
      annotations: [
        { page: 65, kind: "note", text: "Kiểm tra lại thông số DS pad", color: "#66bb6a" },
      ],
      translations: [
        {
          original: "The xSPI target device output driver strength may be configured.",
          output: "Độ mạnh bộ điều khiển ngõ ra của thiết bị đích xSPI có thể được cấu hình.",
          targetLanguage: "Tiếng Việt",
          updatedAt: Date.now(),
        },
      ],
      vocabularyWords: [
        {
          word: "register",
          ipa: "/ˈrɛdʒɪstər/",
          meaning: "thanh ghi",
          context: "configured by writing to a register",
        },
      ],
    }

    const md = buildStudySummaryMarkdown(data)

    expect(md).toContain("# 📚 Báo cáo học tập & Ghi chú PDF")
    expect(md).toContain("JEDEC Standard 251C.pdf")
    expect(md).toContain("Driver Type Selection")
    expect(md).toContain("Chú ý cấu hình register SFDP")
    expect(md).toContain("Kiểm tra lại thông số DS pad")
    expect(md).toContain("Độ mạnh bộ điều khiển ngõ ra")
    expect(md).toContain("register")
    expect(md).toContain("/ˈrɛdʒɪstər/")
    expect(md).toContain("thanh ghi")
  })

  it("handles empty data gracefully", () => {
    const emptyData: StudySummaryExportData = {
      documentId: "a".repeat(64),
      title: "Empty.pdf",
      numPages: 10,
      bookmarks: [],
      textNotes: [],
      annotations: [],
      translations: [],
      vocabularyWords: [],
    }

    const md = buildStudySummaryMarkdown(emptyData)
    expect(md).toContain("Empty.pdf")
    expect(md).toContain("Chưa có bookmark nào")
    expect(md).toContain("Chưa có ghi chú hoặc ô chữ")
    expect(md).toContain("Chưa có đoạn dịch nào")
    expect(md).toContain("Chưa có từ vựng nào")
  })
})
