import { useEffect, useState } from "react"
import { browser } from "#imports"

export function PdfPanelButton() {
  const [windowId, setWindowId] = useState<number>(),
    [error, setError] = useState("")
  useEffect(() => {
    let disposed = false
    void browser.windows
      .getCurrent()
      .then((window) => {
        if (!disposed) setWindowId(window.id)
      })
      .catch(() => {})
    return () => {
      disposed = true
    }
  }, [])
  if (typeof browser.sidePanel?.open !== "function") return null
  return (
    <div>
      <button
        type="button"
        aria-label="Mở khung dịch PDF"
        title="Mở khung dịch PDF cố định"
        disabled={windowId === undefined}
        className="rounded-md px-2 py-1 text-xs hover:bg-muted"
        onClick={() => {
          if (windowId === undefined) return
          // Invoke synchronously in this click's user-gesture task.
          void browser.sidePanel
            .open({ windowId })
            .then(() => window.close())
            .catch(() => setError("Chưa mở được khung PDF. Dùng mục dịch trong menu chuột phải."))
        }}
      >
        PDF
      </button>
      {error && (
        <p
          role="alert"
          className="absolute top-14 right-2 left-2 z-10 rounded-md border bg-popover p-2 text-xs"
        >
          {error}
        </p>
      )}
    </div>
  )
}
