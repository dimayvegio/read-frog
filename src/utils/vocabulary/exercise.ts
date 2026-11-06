import { z } from "zod"

export const exerciseLogSchema = z
  .strictObject({
    kind: z.enum(["recall", "dictation", "cloze", "correction"]),
    runId: z.string().uuid(),
    parentAttemptId: z.string().uuid().optional(),
    assisted: z.boolean(),
    pasted: z.boolean(),
    hintLevel: z.enum(["none", "first-letter", "partial", "answer"]),
    audioReplays: z.number().int().min(0).max(1000),
    expectedAnswer: z.string().min(1).max(160),
  })
  .superRefine((log, ctx) => {
    if (
      ((log.hintLevel !== "none" || log.pasted) && !log.assisted) ||
      (log.kind === "correction" &&
        (!log.parentAttemptId || !log.assisted || log.hintLevel !== "answer")) ||
      (log.kind !== "correction" && log.parentAttemptId)
    )
      ctx.addIssue({ code: "custom", message: "Invalid exercise assistance" })
  })
export type ExerciseLog = z.infer<typeof exerciseLogSchema>
export const isCorrection = (event: { exercise?: ExerciseLog }) =>
  event.exercise?.kind === "correction"
export const isUnassisted = (event: { exercise?: ExerciseLog }) =>
  !isCorrection(event) && !event.exercise?.assisted
