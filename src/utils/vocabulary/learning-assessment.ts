import type { ReviewEvent } from "./review-log"
import type { VocabularyCard } from "./schema"

export type StudyWord = Pick<VocabularyCard, "id" | "word" | "meaning" | "language">

// Explainable practice flags, not a proficiency test or a mastery certificate.
export function assessVocabulary(events: ReviewEvent[], inventory?: readonly StudyWord[]) {
  const histories = new Map<string, ReviewEvent[]>()
  for (const event of events) {
    const history = histories.get(event.cardId)
    if (history) history.push(event)
    else histories.set(event.cardId, [event])
  }
  for (const history of histories.values())
    history.sort((a, b) => a.occurredAt - b.occurredAt || a.id.localeCompare(b.id))
  const words =
    inventory ??
    [...histories].map(([id, history]) => ({
      id,
      word: history.at(-1)!.word,
      meaning: history.at(-1)!.meaning,
      language: history.at(-1)!.language,
    }))
  const assessments = words.map((word) => {
    const history = histories.get(word.id) ?? [],
      latest = history.at(-1)
    const objective = history.filter((event) => event.result !== "self"),
      recent = objective.slice(-5)
    const consecutive: ReviewEvent[] = []
    for (let i = objective.length - 1; i >= 0 && objective[i]!.result === "correct"; i--)
      consecutive.push(objective[i]!)
    const sessions = new Set(consecutive.map((event) => event.sessionId)).size
    const spanDays = consecutive.length
      ? (consecutive[0]!.occurredAt - consecutive.at(-1)!.occurredAt) / 86_400_000
      : 0
    const recentMisses = recent.filter((event) => event.result !== "correct").length
    let status: "needsReview" | "developing" | "recallSignals" | "notAssessed" = "notAssessed"
    const reasons: string[] = []
    if (latest?.result === "incorrect" || latest?.result === "revealed") {
      status = "needsReview"
      reasons.push(
        latest.result === "incorrect"
          ? "Lượt gần nhất trả lời sai."
          : "Lượt gần nhất phải mở đáp án.",
      )
    } else if (latest?.result === "self" && (latest.grade === "again" || latest.grade === "hard")) {
      status = "needsReview"
      reasons.push(
        `Lượt gần nhất tự đánh giá ${latest.grade === "again" ? "Chưa nhớ" : "Khó"}; đây là tự đánh giá, chưa phải kết quả chấm tự động.`,
      )
    } else if (recentMisses && consecutive.length < 3) {
      status = "needsReview"
      reasons.push(
        `Trong ${recent.length} lượt chấm tự động gần nhất có ${recentMisses} lượt sai/mở đáp án; mới đúng liên tiếp ${consecutive.length} lượt.`,
      )
    } else if (
      consecutive.length >= 3 &&
      sessions >= 2 &&
      spanDays >= 1 &&
      consecutive.some((event) => event.mode === "type")
    ) {
      status = "recallSignals"
      reasons.push(
        `Đúng liên tiếp ${consecutive.length} lượt qua ${sessions} phiên cách nhau ít nhất một ngày, có gõ đáp án. Có dấu hiệu nhớ; vẫn cần kiểm tra lại sau.`,
      )
    } else if (objective.length) {
      status = "developing"
      if (consecutive.length < 3)
        reasons.push("Mới trả lời đúng ít lần; cần kiểm tra lại để xác nhận.")
      if (sessions < 2) reasons.push("Chưa có chuỗi trả lời đúng qua ít nhất hai phiên học.")
      if (spanDays < 1) reasons.push("Chưa xác nhận lại sau ít nhất một ngày.")
      if (!consecutive.some((event) => event.mode === "type"))
        reasons.push(
          "Chưa xác nhận bằng gõ đáp án; trắc nghiệm có thể chỉ phản ánh khả năng nhận diện.",
        )
    } else
      reasons.push(
        history.length
          ? "Mới tự đánh giá thẻ lật, chưa có câu trả lời được chấm tự động."
          : "Chưa có lượt kiểm tra trong nhật ký; không suy ra là đã thuộc hoặc chưa thuộc.",
      )
    return {
      cardId: word.id,
      word: word.word,
      meaning: word.meaning.slice(0, 200),
      language: word.language,
      status,
      reasons,
      evidence: {
        attempts: history.length,
        checkedAttempts: objective.length,
        correct: objective.filter((event) => event.result === "correct").length,
        incorrect: objective.filter((event) => event.result === "incorrect").length,
        revealed: objective.filter((event) => event.result === "revealed").length,
        consecutiveCorrect: consecutive.length,
        consecutiveCorrectSessions: sessions,
        consecutiveCorrectSpanDays: Math.round(spanDays * 100) / 100,
        lastAttemptAt: latest?.occurredAt ?? null,
      },
      recentMistakes: objective
        .filter((event) => event.result !== "correct")
        .slice(-3)
        .reverse()
        .map((event) => ({
          at: event.occurredAt,
          mode: event.mode,
          result: event.result,
          answer: event.answer,
          expectedAnswer: event.mode === "type" ? event.word : event.meaning,
        })),
    }
  })
  const priority = { needsReview: 0, developing: 1, notAssessed: 2, recallSignals: 3 }
  assessments.sort(
    (a, b) =>
      priority[a.status] - priority[b.status] ||
      b.evidence.incorrect + b.evidence.revealed - a.evidence.incorrect - a.evidence.revealed ||
      a.word.localeCompare(b.word),
  )
  return {
    method: "review-evidence-rules-v1",
    scope: "all-recorded-history",
    inventoryProvided: inventory !== undefined,
    explanation:
      "Phân nhóm từ bằng toàn bộ nhật ký, độc lập bộ lọc ngày của thống kê. Nếu có danh sách từ hiện tại, chỉ đề xuất từ còn trong sổ. Đây là quy tắc gợi ý ôn tập; không khẳng định đã thuộc hoặc xếp trình độ CEFR.",
    needsReview: assessments.filter((word) => word.status === "needsReview"),
    developing: assessments.filter((word) => word.status === "developing"),
    recallSignals: assessments.filter((word) => word.status === "recallSignals"),
    notAssessed: assessments.filter((word) => word.status === "notAssessed"),
  }
}
