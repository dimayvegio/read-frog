import { useEffect, useState } from "react"
import { browser } from "#imports"
import { STUDY_HIGHLIGHT_KEY, studyHighlightsEnabled } from "@/utils/vocabulary/study-client"
export function StudyHighlightsSwitch() {
  const [enabled, setEnabled] = useState(true)
  useEffect(() => {
    void studyHighlightsEnabled().then(setEnabled)
  }, [])
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => {
          const next = event.target.checked
          setEnabled(next)
          void browser.storage.local.set({ [STUDY_HIGHLIGHT_KEY]: next })
        }}
      />
      Tô từ trong sổ đang chọn
    </label>
  )
}
