import type { createReviewReport } from "./review-log"

const cell = (value: string | number | null) =>
  String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\r\n]+/g, " ")
    .replace(/([\\|`*_[\]])/g, "\\$1")

export function reviewReportMarkdown(report: ReturnType<typeof createReviewReport>) {
  const summary = report.summary,
    assessment = report.assessment
  const lines = [
    "# Báo cáo ôn từ vựng Read Frog",
    "",
    `Sổ: ${cell(report.notebook?.name ?? "Chưa đặt tên")} · Xuất: ${new Date(report.exportedAt).toISOString()} · Múi giờ: ${cell(report.timeZone)}`,
    "",
    "## Các từ cần tập trung trước",
    "",
    `${assessment.needsReview.length} từ cần ôn lại; ${assessment.developing.length} từ đang củng cố; ${assessment.recallSignals.length} từ có dấu hiệu nhớ; ${assessment.notAssessed.length} từ chưa đủ dữ liệu kiểm tra.`,
    "",
    assessment.explanation,
    "",
  ]
  for (const [title, words] of [
    ["Cần ôn lại", assessment.needsReview],
    ["Đang củng cố", assessment.developing],
    ["Có dấu hiệu nhớ", assessment.recallSignals],
    ["Chưa đủ dữ liệu", assessment.notAssessed],
  ] as const) {
    lines.push(`### ${title}`, "")
    if (!words.length) {
      lines.push("Không có từ trong nhóm này.", "")
      continue
    }
    lines.push(
      "| Từ | Nghĩa | Ngôn ngữ | Đúng / sai / mở đáp án | Lý do |",
      "| --- | --- | --- | --- | --- |",
    )
    for (const word of words)
      lines.push(
        `| ${cell(word.word)} | ${cell(word.meaning)} | ${cell(word.language)} | ${word.evidence.correct} / ${word.evidence.incorrect} / ${word.evidence.revealed} | ${cell(word.reasons.join(" "))} |`,
      )
    lines.push("")
    for (const word of words)
      for (const mistake of word.recentMistakes)
        lines.push(
          `- ${cell(word.word)} (${mistake.mode === "type" ? "gõ đáp án" : "trắc nghiệm"}, ${new Date(mistake.at).toISOString()}): ${mistake.result === "revealed" ? "đã mở đáp án" : `trả lời “${cell(mistake.answer)}”`}; đáp án: “${cell(mistake.expectedAnswer)}”.`,
        )
    lines.push("")
  }
  lines.push(
    "## Thống kê theo khoảng đã chọn",
    "",
    `Khoảng: ${report.period.from === null ? "toàn bộ nhật ký" : new Date(report.period.from).toISOString()} đến ${new Date(report.period.to).toISOString()}.`,
    "",
    `- ${summary.uniqueWords} từ, ${summary.attempts} lượt kiểm tra.`,
    `- ${summary.correct} đúng; ${summary.incorrect} sai; ${summary.revealed} mở đáp án; ${summary.selfRated} tự đánh giá thẻ lật.`,
    `- Tỷ lệ đúng trong câu đã trả lời: ${summary.accuracyPercent === null ? "chưa có dữ liệu" : `${summary.accuracyPercent}%`}.`,
    `- Tỷ lệ tự nhớ, tính mở đáp án là chưa nhớ: ${summary.unassistedRecallPercent === null ? "chưa có dữ liệu" : `${summary.unassistedRecallPercent}%`}.`,
    "",
    "Thẻ lật là tự đánh giá, không làm tăng tỷ lệ đúng tự động. Nhật ký cũ chưa từng ghi không được suy diễn từ lịch ôn. Báo cáo đánh giá việc học trong bộ từ này; không phải bài kiểm tra trình độ ngoại ngữ chung. Muốn xem từng lượt đầy đủ, dùng báo cáo JSON.",
    "",
  )
  return lines.join("\n")
}
