import type { StudyWord } from "@/utils/vocabulary/study-snapshot"
import { useEffect, useState } from "react"
import { browser } from "#imports"
import {
  readStudySnapshot,
  studyHighlightsEnabled,
  STUDY_HIGHLIGHT_KEY,
} from "@/utils/vocabulary/study-client"
export function useStudyWords() {
  const [words, setWords] = useState<StudyWord[]>([])
  useEffect(() => {
    let disposed = false
    const refresh = async () => {
      if (document.hidden) return
      try {
        const enabled = await studyHighlightsEnabled()
        const snapshot = enabled ? await readStudySnapshot(true) : null
        if (!disposed) setWords(snapshot?.words ?? [])
      } catch {
        if (!disposed) setWords([])
      }
    }
    void refresh()
    const changed = (changes: Record<string, unknown>) => {
      if (STUDY_HIGHLIGHT_KEY in changes || "vocabularyStudyRevision" in changes) void refresh()
    }
    const timer = setInterval(() => void refresh(), 30000)
    window.addEventListener("focus", refresh)
    browser.storage.onChanged.addListener(changed)
    return () => {
      disposed = true
      clearInterval(timer)
      window.removeEventListener("focus", refresh)
      browser.storage.onChanged.removeListener(changed)
    }
  }, [])
  return words
}
