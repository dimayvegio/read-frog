import type { createReviewReport } from "./review-log"

const cell = (value: string | number | null) =>
  String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\r\n]+/g, " ")
    .replace(/([\\|`*_[\]])/g, "\\$1")
const labels: Record<string, string> = {
  recall: "gõ",
  dictation: "nghe",
  cloze: "điền câu",
  choice: "trắc nghiệm",
}

export function reviewReportMarkdown(report: ReturnType<typeof createReviewReport>) {
  const a = report.assessment,
    s = report.summary
  const compact = a.needsReview.length + a.developing.length + a.recallSignals.length > 50
  const lastDate = (at: number | null) =>
    at === null ? "—" : new Date(at).toISOString().slice(0, 10)
  const lines = [
    "# Báo cáo ôn từ vựng Read Frog — bản ngắn",
    "",
    `Sổ: ${cell(report.notebook?.name ?? "Chưa đặt tên")} · ${new Date(report.exportedAt).toISOString().slice(0, 10)} · ${cell(report.timeZone)}`,
    "",
    `${a.needsReview.length} từ cần ôn; ${a.developing.length} đang củng cố; ${a.recallSignals.length} có dấu hiệu nhớ; ${a.notAssessed.length} chưa đủ dữ liệu.`,
    `${s.correct} lượt tự nhớ đúng / ${s.incorrect} sai / ${s.assistedAttempts} có hỗ trợ / ${s.revealed} mở đáp án. ${s.correctionAttempts} lượt gõ sửa không tính là tự nhớ đúng.`,
    "",
    "Phân nhóm dùng toàn bộ nhật ký của từ còn trong sổ; số lượt tổng hợp theo khoảng đã chọn. Chưa kiểm tra không có nghĩa là đã thuộc/chưa thuộc. Đây là gợi ý học, không phải xếp trình độ CEFR.",
    "",
  ]
  for (const [title, words] of [
    ["Cần ôn lại", a.needsReview],
    ["Đang củng cố", a.developing],
  ] as const) {
    lines.push(`### ${title}`, "")
    if (!words.length) {
      lines.push("Không có từ trong nhóm này.", "")
      continue
    }
    lines.push(
      "| Từ / nghĩa | Tự đúng / sai / hỗ trợ | Theo dạng bài (đúng/sai/hỗ trợ) | Lý do và lỗi gần nhất | Ôn tiếp |",
      "| --- | --- | --- | --- | --- |",
    )
    for (const word of compact ? words.slice(0, 15) : words) {
      const mistake = word.recentMistakes[0]
      const error = mistake
        ? `${labels[mistake.kind] ?? "tự nhớ"}: ${mistake.result === "revealed" ? "mở đáp án" : mistake.assisted ? `có hỗ trợ (${mistake.answer})` : `${mistake.answer} → ${mistake.expectedAnswer}`}`
        : ""
      const practice = Object.entries(word.practice)
        .filter(([, value]) => value.attempts)
        .map(
          ([kind, value]) =>
            `${labels[kind]} ${value.correct}/${value.incorrect}/${value.assisted}`,
        )
        .join("; ")
      lines.push(
        `| ${cell(word.word)} (${cell(word.language)}) — ${cell(word.meaning.slice(0, 100))} | ${word.evidence.correct}/${word.evidence.incorrect}/${word.evidence.assisted + word.evidence.revealed} | ${cell(practice)} | ${cell(word.reasons[0] ?? "")} ${cell(error)} | ${cell(word.nextPractice)} |`,
      )
    }
    if (compact && words.length > 15)
      lines.push(
        "",
        `Chi tiết 15 từ ưu tiên; tiến trình tất cả ${words.length} từ nằm ở bảng gọn bên dưới.`,
      )
    lines.push("")
  }
  if (compact) {
    lines.push(
      "### Tiến trình từng từ — bảng gọn",
      "",
      "Đ/S/H = tự đúng / tự sai / có hỗ trợ hoặc mở đáp án. Lần cuối dùng ngày UTC. Nhóm N = cần ôn, C = củng cố, R = có dấu hiệu nhớ. Mỗi từ vẫn có số liệu riêng; lịch sử từng lượt nằm trong JSON/ZIP.",
      "",
      "| Từ | Nhóm | Đ/S/H | Lần cuối | Ôn tiếp |",
      "| --- | --- | --- | --- | --- |",
    )
    for (const [group, words] of [
      ["N", a.needsReview],
      ["C", a.developing],
      ["R", a.recallSignals],
    ] as const)
      for (const word of words)
        lines.push(
          `| ${cell(word.word)} (${cell(word.language)}) | ${group} | ${word.evidence.correct}/${word.evidence.incorrect}/${word.evidence.assisted + word.evidence.revealed} | ${lastDate(word.evidence.lastAttemptAt)} | ${cell(word.nextPractice)} |`,
        )
    lines.push("")
  }
  for (const [title, words] of [
    ["Có dấu hiệu nhớ", compact ? [] : a.recallSignals],
    ["Chưa đủ dữ liệu", a.notAssessed],
  ] as const)
    if (!(compact && title === "Có dấu hiệu nhớ"))
      lines.push(
        `### ${title}`,
        "",
        words.length
          ? words.map((word) => `${cell(word.word)} (${cell(word.language)})`).join(", ")
          : "Không có từ trong nhóm này.",
        "",
      )
  lines.push(
    "Tự đánh giá thẻ lật, gợi ý, dán đáp án và gõ sửa không phải bằng chứng tự nhớ đúng. Một lần đúng chưa xác nhận đã thuộc. Muốn xem từng lượt đầy đủ, dùng báo cáo JSON.",
    "",
  )
  return lines.join("\n")
}
