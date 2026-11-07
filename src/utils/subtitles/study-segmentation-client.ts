import type { StudyWord } from "./study-segmentation"
import { createPortStreamPromise } from "@/utils/content-script/port-streaming"
import { SENTENCE_STUDY_PORT } from "./study-segmentation"

export function requestStudySegmentation(words: StudyWord[], signal: AbortSignal) {
  signal.throwIfAborted()
  return createPortStreamPromise<number[]>(SENTENCE_STUDY_PORT, words, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(95000)]),
  })
}
