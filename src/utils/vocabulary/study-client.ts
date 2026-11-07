import type { StudySnapshot } from "./study-snapshot"
import { browser } from "#imports"
import { sendMessage } from "@/utils/message"
let cached: StudySnapshot | null = null,
  loadedAt = 0
let pending: Promise<StudySnapshot> | null = null
export const STUDY_HIGHLIGHT_KEY = "studyHighlightsEnabled"
export async function readStudySnapshot(force = false) {
  if (!force && cached && Date.now() - loadedAt < 5000) return cached
  if (pending) return pending
  pending = sendMessage("getVocabularyStudySnapshot", undefined)
    .then((value) => {
      cached = value
      loadedAt = Date.now()
      return value
    })
    .finally(() => {
      pending = null
    })
  return pending
}
export async function studyHighlightsEnabled() {
  return (await browser.storage.local.get(STUDY_HIGHLIGHT_KEY))[STUDY_HIGHLIGHT_KEY] !== false
}
