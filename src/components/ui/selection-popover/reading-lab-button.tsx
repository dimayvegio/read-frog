import { useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { toastManager } from "@/components/ui/base-ui/toast"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
export function ReadingLabButton({
  original,
  translation,
  title,
  disabled = false,
}: {
  original: string | null | undefined
  translation: string | undefined
  title?: string
  disabled?: boolean
}) {
  const [opening, setOpening] = useState(false)
  return (
    <Button
      data-reading-lab
      variant="outline"
      size="sm"
      disabled={disabled || opening || !original?.trim() || !translation?.trim()}
      onClick={() => {
        if (!original || !translation || opening) return
        setOpening(true)
        void sendMessage("openReadingLab", {
          original,
          translation,
          title: title?.slice(0, 160) || "Đoạn đọc mới",
        })
          .catch(() => toastManager.add({ type: "error", title: i18n.t("readingLab.openFailed") }))
          .finally(() => setOpening(false))
      }}
    >
      {i18n.t("readingLab.open")}
    </Button>
  )
}
