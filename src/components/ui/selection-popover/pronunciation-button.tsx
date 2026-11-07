import { useMemo, useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { toastManager } from "@/components/ui/base-ui/toast"
import { sendMessage } from "@/utils/message"
import { isEnglishPracticeText } from "@/utils/pronunciation/english"

export function PronunciationButton({
  text,
  context = "",
}: {
  text: string | null | undefined
  context?: string
}) {
  const [opening, setOpening] = useState(false)
  const english = useMemo(() => isEnglishPracticeText(text, context), [text, context])
  if (!english) return null
  return (
    <Button
      variant="outline"
      size="sm"
      data-pronunciation
      disabled={opening || !text?.trim()}
      onClick={() => {
        if (!text?.trim() || opening) return
        if (text.length > 20000) {
          toastManager.add({ type: "error", title: "Chọn đoạn ngắn hơn để luyện phát âm." })
          return
        }
        setOpening(true)
        void sendMessage("openPronunciation", { text, context: context.slice(0, 2000) })
          .catch(() => toastManager.add({ type: "error", title: "Không mở được khung Phát âm." }))
          .finally(() => setOpening(false))
      }}
    >
      Phát âm
    </Button>
  )
}
