import { loadLibrary, loadReviewEvents } from "./db"
import { assessVocabulary } from "./learning-assessment"
import { normalizeAnswer } from "./schema"

export interface StudyWord {
  id: string
  word: string
  meaning: string
  variants: string[]
  status: "needsReview" | "developing" | "recallSignals" | "notAssessed"
  reason: string
  lastAt: number | null
  context: string
}
export interface StudySnapshot {
  notebookId: string | null
  notebookName: string
  words: StudyWord[]
}
export async function getStudySnapshot(notebookId?: string): Promise<StudySnapshot> {
  const library = await loadLibrary(notebookId)
  if (!library.notebook) return { notebookId: null, notebookName: "", words: [] }
  const assessment = assessVocabulary(await loadReviewEvents(library.notebook.id), library.cards)
  const byId = new Map(
    Object.values({
      needsReview: assessment.needsReview,
      developing: assessment.developing,
      recallSignals: assessment.recallSignals,
      notAssessed: assessment.notAssessed,
    })
      .flat()
      .map((word) => [word.cardId, word]),
  )
  return {
    notebookId: library.notebook.id,
    notebookName: library.notebook.name,
    words: library.cards.map((card) => {
      const evidence = byId.get(card.id)!
      return {
        id: card.id,
        word: card.word,
        meaning: card.meaning,
        variants: [...new Set([card.word, ...card.acceptedAnswers].map(normalizeAnswer))],
        status: evidence.status,
        reason: evidence.reasons.join(" "),
        lastAt: evidence.evidence.lastAttemptAt,
        context: card.context.slice(0, 320),
      }
    }),
  }
}
