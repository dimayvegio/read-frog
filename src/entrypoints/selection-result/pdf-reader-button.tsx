import { useState } from "react"
import { browser } from "#imports"
import { Button } from "@/components/ui/base-ui/button"
import { sendMessage } from "@/utils/message"
export function PdfReaderButton() {
  const [error, setError] = useState("")
  return (
    <div className="border-b p-3 text-sm">
      <Button
        variant="outline"
        onClick={async () => {
          try {
            const window = await browser.windows.getCurrent()
            if (window.id === undefined) throw new Error("Không xác định được cửa sổ")
            await sendMessage("openPdfReader", { windowId: window.id })
          } catch {
            setError("Chưa mở được trình đọc. Hãy thử lại.")
          }
        }}
      >
        Đọc PDF và tự lưu vị trí
      </Button>
      <p className="mt-1 text-xs text-muted-foreground">
        Mở bằng trình đọc Read Frog để tự nhớ trang, vị trí cuộn và thu phóng.
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
