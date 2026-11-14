import { ScanLine } from "lucide-react"
import { useEffect, useState } from "react"
import { browser } from "#imports"
import { imageShortcutLabel, openImageShortcuts } from "@/utils/image-translation/shortcut"
import { sendMessage } from "@/utils/message"

export function ImageTranslationButton() {
  const [shortcut, setShortcut] = useState("")
  useEffect(() => {
    void imageShortcutLabel()
      .then(setShortcut)
      .catch(() => setShortcut("Chưa gán"))
  }, [])
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("")
  return (
    <div className="px-4 pb-2.5 text-xs">
      <button
        type="button"
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 font-medium transition-colors hover:bg-muted disabled:opacity-50"
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
        <ScanLine className="size-4 shrink-0 text-primary" />
        <span>{busy ? "Đang chụp…" : "Chụp vùng & dịch ảnh"}</span>
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <button
          type="button"
          className="transition-colors hover:text-foreground"
          onClick={() => void sendMessage("openImageTranslation", undefined)}
        >
          Dán / mở ảnh có sẵn
        </button>
        <button
          type="button"
          className="transition-colors hover:text-foreground"
          onClick={() => void openImageShortcuts()}
        >
          Phím tắt: <kbd className="font-sans font-medium text-foreground">{shortcut}</kbd>
        </button>
      </div>
    </div>
  )
}
