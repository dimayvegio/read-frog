import { criterionKeys, criterionLabels, wordTokens, type PronunciationAttempt } from "./schema"

export function pronunciationReport(attempts: PronunciationAttempt[]): string {
  const rows = [...attempts].sort((a, b) => a.createdAt - b.createdAt)
  const assessed = rows.filter((a) => a.score !== null)
  const lines = [
    "# Tiến trình luyện phát âm Mỹ — Read Frog",
    "",
    "Điểm AI ước lượng theo rubric en-us-v1; thang 0–10, bước 0,5. Không phải điểm thi. Không suy ra phát âm chỉ từ transcript. Chỉ so sánh cùng đoạn/ngữ cảnh, rubric và model thực tế. Không có audio, API key hoặc dữ liệu SRS trong báo cáo.",
    "",
    `Tổng ${rows.length} lần chấm duy nhất; ${assessed.length} có điểm; ${rows.length - assessed.length} cần thu lại.`,
    "",
    "Hãy chỉ ra từ/âm còn yếu, lỗi lặp lại và kế hoạch luyện ngắn. Phân biệt tiến bộ quan sát được với nhận xét AI chưa chắc chắn.",
  ]
  for (const row of rows) {
    lines.push(
      "",
      `## ${new Date(row.createdAt).toISOString()} — ${row.score === null ? "Chưa chấm được" : `${row.score}/10`}`,
      `ID: ${row.id}; đoạn: ${row.referenceKey}; model: ${row.model}; rubric: ${row.rubric}`,
      `Đọc: ${row.text}`,
    )
    if (row.context) lines.push(`Ngữ cảnh: ${row.context}`)
    lines.push(
      `AI nghe gần đúng: ${row.feedback.heardText || "Không rõ"}`,
      `Độ chắc chắn: ${row.feedback.confidence}; trạng thái: ${row.feedback.reason}`,
      row.feedback.overview,
    )
    for (const key of criterionKeys)
      lines.push(
        `- ${criterionLabels[key]}: ${row.feedback.criteria[key].score ?? "N/A"}. ${row.feedback.criteria[key].feedback}`,
      )
    for (const finding of row.feedback.findings)
      lines.push(
        `- [${finding.category}; ${finding.confidence}] ${
          finding.wordStart === null
            ? "Cả đoạn"
            : wordTokens(row.text)
                .slice(finding.wordStart, finding.wordEnd! + 1)
                .join(" ")
        }: nghe ${finding.heard}; đích ${finding.expected}. ${finding.explanation} Luyện: ${finding.practice}`,
      )
    if (row.feedback.strengths.length) lines.push(`Làm tốt: ${row.feedback.strengths.join("; ")}`)
    lines.push(`Lần tiếp: ${row.feedback.nextPractice.join("; ")}`)
  }
  return lines.join("\n")
}
