import type { ExerciseLog } from "./exercise"
import type { ReviewEvent } from "./review-log"
import { vocabularyDB, recordReviewAnswer, putReviewEvent, loadVocabularySources } from "./db"
import {
  createLearningRun,
  currentLearningTask,
  advanceLearningRun,
  answerMatches,
  learningRunSchema,
  type LearningMode,
} from "./guided-learning"
import { emptyProgress, scheduleReview, type VocabularyCard, type CardProgress } from "./schema"

export async function loadLearningRun(notebookId: string) {
  const stored = await vocabularyDB.learningRuns.get(notebookId),
    parsed = learningRunSchema.safeParse(stored)
  if (!parsed.success) return null
  const run = parsed.data,
    ids = new Set(
      (await vocabularyDB.notebookCards.where("notebookId").equals(notebookId).toArray()).map(
        (card) => card.id,
      ),
    )
  let pruned = false
  while (currentLearningTask(run) && !ids.has(currentLearningTask(run)!.cardId)) {
    run.cursor++
    pruned = true
  }
  if (pruned) {
    run.phase = currentLearningTask(run) ? "question" : "done"
    run.feedback = null
    run.hint = "none"
    run.pasted = false
    run.corrected = false
    await vocabularyDB.learningRuns.put(run)
  }
  return run
}
export async function startLearningRun(
  notebookId: string,
  cards: VocabularyCard[],
  events: ReviewEvent[],
  progress: CardProgress[],
  mode: LearningMode,
) {
  const run = createLearningRun(
    notebookId,
    cards,
    events,
    progress,
    mode,
    Date.now(),
    await loadVocabularySources(notebookId),
  )
  await vocabularyDB.learningRuns.put(run)
  return run
}
async function requireRun(notebookId: string, id: string) {
  const run = learningRunSchema.parse(await vocabularyDB.learningRuns.get(notebookId))
  if (run.id !== id) throw new Error("Buổi học đã thay đổi ở cửa sổ khác. Hãy mở lại buổi học.")
  return run
}
export async function changeLearningRun(
  notebookId: string,
  id: string,
  action: "hint" | "paste" | "audio" | "intro" | "next",
  taskId?: string,
) {
  return vocabularyDB.transaction(
    "rw",
    vocabularyDB.learningRuns,
    vocabularyDB.notebookCards,
    async () => {
      let run = await requireRun(notebookId, id)
      const task = currentLearningTask(run)
      if (taskId && task?.id !== taskId)
        throw new Error("Bước học đã thay đổi ở cửa sổ khác. Hãy mở lại buổi học.")
      if (!task) return run
      if (action === "next" && run.phase === "feedback")
        run = advanceLearningRun(
          run,
          await vocabularyDB.notebookCards.where("notebookId").equals(notebookId).toArray(),
        )
      if (action === "intro" && run.phase === "study") {
        run.introduced = [...new Set([...run.introduced, task.cardId])]
        run.phase = "question"
      }
      if (run.phase === "question") {
        if (action === "hint") run.hint = run.hint === "none" ? "first-letter" : "partial"
        if (action === "paste") run.pasted = true
        if (action === "audio") run.replays = Math.min(1000, run.replays + 1)
      }
      run.updatedAt = Date.now()
      await vocabularyDB.learningRuns.put(learningRunSchema.parse(run))
      return run
    },
  )
}
export async function submitLearningAnswer(
  notebookId: string,
  id: string,
  answer: string,
  sessionId: string,
  elapsedMs: number,
  reveal = false,
  taskId?: string,
) {
  return vocabularyDB.transaction(
    "rw",
    vocabularyDB.learningRuns,
    vocabularyDB.notebookCards,
    vocabularyDB.notebookProgress,
    vocabularyDB.reviewEvents,
    vocabularyDB.meta,
    async () => {
      const run = await requireRun(notebookId, id),
        task = currentLearningTask(run)
      if (taskId && task?.id !== taskId)
        throw new Error("Bước học đã thay đổi ở cửa sổ khác. Hãy mở lại buổi học.")
      if (!task || (run.phase !== "question" && run.phase !== "correction")) return { run }
      if (!(await vocabularyDB.notebookCards.get([notebookId, task.cardId])))
        throw new Error("Từ này đã bị xóa hoặc chuyển sổ. Hãy mở lại buổi học.")
      const correction = run.phase === "correction",
        correct = !reveal && answerMatches(task, answer),
        now = Date.now()
      const exercise: ExerciseLog = {
        kind: correction ? "correction" : task.kind,
        runId: run.id,
        assisted: correction || reveal || run.pasted || run.hint !== "none",
        pasted: run.pasted,
        hintLevel: correction || reveal ? "answer" : run.hint,
        audioReplays: run.replays,
        expectedAnswer: task.expected,
        ...(correction && run.feedback ? { parentAttemptId: run.feedback.eventId } : {}),
      }
      const event = await recordReviewAnswer(
        task.cardId,
        "type",
        reveal ? "revealed" : correct ? "correct" : "incorrect",
        answer,
        { id: correction ? run.correctionId : task.id, sessionId, elapsedMs, exercise },
        notebookId,
      )
      let progress: CardProgress | undefined
      if (correction) {
        if (correct) {
          run.corrected = true
          run.phase = "feedback"
        } else run.correctionId = cryptoUUID()
      } else {
        const grade = correct && !exercise.assisted ? "good" : "again"
        const previous = (await vocabularyDB.notebookProgress.get([notebookId, task.cardId])) ?? {
          ...emptyProgress(task.cardId),
          notebookId,
        }
        let scheduled = run.scheduled[task.cardId]
        const first = !scheduled
        if (scheduled && previous.type.updatedAt !== scheduled.lastScheduleUpdatedAt) {
          scheduled = {
            baseline: previous.type,
            worst: "good",
            lastScheduleUpdatedAt: previous.type.updatedAt,
            externallyAdvanced: true,
          }
          run.scheduled[task.cardId] = scheduled
        }
        // One conservative SRS update per word per run; drilling cannot multiply
        // the interval. A later miss reduces it using the original baseline.
        if (first || (scheduled!.worst === "good" && grade === "again")) {
          const baseline = scheduled?.baseline ?? previous.type
          previous.type = scheduleReview(
            baseline,
            grade,
            Math.max(now, previous.type.updatedAt + 1),
          )
          if (scheduled?.externallyAdvanced) previous.type.reviews = baseline.reviews
          run.scheduled[task.cardId] = {
            baseline,
            worst: grade,
            lastScheduleUpdatedAt: previous.type.updatedAt,
            externallyAdvanced: scheduled?.externallyAdvanced ?? false,
          }
          await vocabularyDB.notebookProgress.put(previous)
        }
        const { notebookId: _notebookId, ...publicProgress } = previous
        progress = publicProgress
        event.grade = grade
        event.gradedAt = Math.max(now, 1)
        await putReviewEvent(notebookId, event)
        run.feedback = {
          result: reveal ? "revealed" : correct ? "correct" : "incorrect",
          answer: answer.slice(0, 300),
          eventId: event.id,
        }
        run.phase = correct ? "feedback" : "correction"
      }
      run.updatedAt = now
      await vocabularyDB.learningRuns.put(learningRunSchema.parse(run))
      return { run, event, progress }
    },
  )
}
import { getRandomUUID as cryptoUUID } from "../crypto-polyfill"
