import { Clock3, FileText, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { listRecentPdfs, recentFilesDB, type RecentPdf } from "./recent-files"

export function RecentFilesMenu({
  refresh,
  onOpen,
}: {
  refresh: string
  onOpen: (file: RecentPdf) => Promise<void>
}) {
  const [open, setOpen] = useState(false),
    [files, setFiles] = useState<RecentPdf[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  // oxlint-disable-next-line react/exhaustive-effect-dependencies -- refresh/open explicitly invalidate the local IndexedDB list.
  useEffect(() => {
    if (!open && !refresh) return () => {}
    let alive = true
    void listRecentPdfs()
      .then((rows) => {
        if (alive) setFiles(rows)
      })
      .catch(() => {
        if (alive) setMessage("Chưa đọc được danh sách file trên máy.")
      })
    return () => {
      alive = false
    }
  }, [refresh, open])
  return (
    <div ref={menuRef} className="rf-recent-files">
      <button
        type="button"
        aria-label="PDF mở gần đây"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Clock3 size={16} />
        Gần đây
      </button>
      {open && (
        <section className="rf-recent-menu" aria-label="Danh sách PDF gần đây">
          <header>
            <strong>PDF gần đây</strong>
            <button
              type="button"
              aria-label="Đóng danh sách gần đây"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </header>
          {!files.length && <p>Chưa có file. Mở một PDF trên máy để bắt đầu.</p>}
          <ol>
            {files.map((file) => (
              <li key={file.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    setMessage("")
                    try {
                      await onOpen(file)
                      setOpen(false)
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "Chưa mở được file. Chọn lại file trên máy.",
                      )
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  <FileText size={18} />
                  <span>
                    <strong>{file.title}</strong>
                    <small>
                      {new Date(file.openedAt).toLocaleString("vi-VN")} ·{" "}
                      {(file.size / 1048576).toFixed(1)} MB{!file.handle ? " · Chọn lại file" : ""}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Bỏ khỏi gần đây: ${file.title}`}
                  title="Chỉ bỏ khỏi danh sách"
                  disabled={busy}
                  onClick={() =>
                    void recentFilesDB.files
                      .delete(file.id)
                      .then(() => setFiles((rows) => rows.filter((row) => row.id !== file.id)))
                      .catch(() => setMessage("Chưa bỏ được mục này."))
                  }
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ol>
          <p className="rf-recent-explanation">
            Chỉ lưu trên máy. Không sao chép hay upload PDF. Bỏ mục không xóa file hoặc vị trí đọc.
          </p>
          {message && <p role="alert">{message}</p>}
        </section>
      )}
    </div>
  )
}
