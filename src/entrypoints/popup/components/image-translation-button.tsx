import { useState } from "react"
import { browser } from "#imports"
import { sendMessage } from "@/utils/message"
export function ImageTranslationButton() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  return (
    <div className="px-6 pb-3 text-sm">
      <button
        type="button"
        className="w-full rounded-md border px-3 py-2 hover:bg-muted"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError("")
          try {
            const window = await browser.windows.getCurrent()
            if (window.id === undefined) throw new Error("Không tìm được cửa sổ.")
            await sendMessage("captureImageTranslation", { windowId: window.id })
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Chưa chụp được tab.")
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? "Đang chụp…" : "Chụp vùng & dịch ảnh"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs">
          {error}
        </p>
      )}
      <button
        type="button"
        className="mt-1 text-xs underline"
        onClick={() => void sendMessage("openImageTranslation", undefined)}
      >
        Dán / mở ảnh có sẵn
      </button>
    </div>
  )
}
