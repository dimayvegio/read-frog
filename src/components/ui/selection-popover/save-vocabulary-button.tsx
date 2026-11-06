import { IconBookmark, IconLoader2, IconBook2 } from "@tabler/icons-react"
import { useEffect, useRef, useState } from "react"
import { createPortStreamPromise } from "@/utils/content-script/port-streaming"
import { sendMessage } from "@/utils/message"
import {
  VOCABULARY_PORT,
  type VocabularyCapture,
  type VocabularySaveEvent,
  type VocabularyNotebook,
} from "@/utils/vocabulary/schema"

export function SaveVocabularyButton({ capture }: { capture: VocabularyCapture }) {
  return <SaveVocabularyOperation key={JSON.stringify(capture)} capture={capture} />
}

function SaveVocabularyOperation({ capture }: { capture: VocabularyCapture }) {
  const [status, setStatus] = useState("")
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [notebooks, setNotebooks] = useState<VocabularyNotebook[]>([])
  const [notebookId, setNotebookId] = useState("")
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (pending) return undefined
    let disposed = false
    const refresh = () => {
      void sendMessage("getVocabularyNotebooks", undefined)
        .then((snapshot) => {
          if (!disposed) {
            setNotebooks(snapshot.notebooks)
            setNotebookId((current) =>
              snapshot.notebooks.some((n) => n.id === current)
                ? current
                : (snapshot.activeNotebookId ?? ""),
            )
          }
        })
        .catch(() => {
          if (!disposed) setStatus("Chưa tải được danh sách sổ. Mở Sổ từ để thử lại.")
        })
    }
    refresh()
    window.addEventListener("focus", refresh)
    return () => {
      disposed = true
      window.removeEventListener("focus", refresh)
    }
  }, [pending])
  const valid = !!capture.word.trim() && capture.word.length <= 160
  const save = async () => {
    const abort = new AbortController()
    controller.current = abort
    setPending(true)
    setStatus("Đang tạo nội dung bằng OpenAI…")
    try {
      const result = await createPortStreamPromise<VocabularySaveEvent>(
        VOCABULARY_PORT,
        { ...capture, notebookId },
        {
          signal: abort.signal,
          onChunk: (e) =>
            setStatus(
              e.stage === "text"
                ? "Đang tạo nghĩa và ví dụ…"
                : e.stage === "word-audio"
                  ? "Đang tạo giọng đọc từ…"
                  : "Đang tạo giọng đọc ví dụ…",
            ),
        },
      )
      if (!abort.signal.aborted) {
        setSaved(true)
        setStatus(result.duplicate ? "Từ này đã có trong sổ." : "Đã lưu từ và audio OpenAI.")
      }
    } catch {
      if (!abort.signal.aborted) setStatus("Chưa lưu được. Kiểm tra OpenAI/API key và thử lại.")
    } finally {
      if (!abort.signal.aborted) setPending(false)
    }
  }
  return (
    <div className="mt-3 space-y-1 border-t pt-2" data-slot="save-vocabulary">
      <label className="flex items-center gap-2 text-xs">
        Lưu vào sổ
        <select
          aria-label="Lưu vào sổ"
          className="min-h-8 min-w-0 flex-1 rounded border bg-background px-2 text-xs"
          value={notebookId}
          disabled={pending || !notebooks.length}
          onChange={(event) => {
            const id = event.target.value
            setNotebookId(id)
            setSaved(false)
            setStatus("")
            void sendMessage("selectVocabularyNotebook", { notebookId: id }).catch(() =>
              setStatus("Chưa ghi nhớ được sổ đã chọn."),
            )
          }}
        >
          {!notebooks.length && <option value="">Đang tải sổ…</option>}
          {notebooks.map((notebook) => (
            <option key={notebook.id} value={notebook.id} className="bg-background text-foreground">
              {notebook.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="flex min-h-8 items-center gap-1 rounded-md px-2 text-xs hover:bg-muted disabled:opacity-50"
          disabled={!valid || !notebookId || pending || saved}
          title={
            valid
              ? "Tạo nghĩa, ví dụ và hai audio bằng OpenAI"
              : "Hãy bôi đen một từ hoặc cụm từ ngắn (tối đa 160 ký tự)."
          }
          onClick={() => void save()}
        >
          {pending ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconBookmark className="size-4" />
          )}
          {saved ? "Đã lưu" : "Lưu để học"}
        </button>
        {pending && (
          <button
            type="button"
            className="min-h-8 text-xs underline"
            onClick={() => {
              controller.current?.abort()
              setPending(false)
              setStatus("Đã hủy.")
            }}
          >
            Hủy
          </button>
        )}
        <button
          type="button"
          className="flex min-h-8 items-center gap-1 rounded-md px-2 text-xs hover:bg-muted"
          onClick={() => void sendMessage("openVocabulary", undefined)}
        >
          <IconBook2 className="size-4" />
          Sổ từ
        </button>
      </div>
      <p role="status" className="text-xs text-muted-foreground">
        {status}
      </p>
    </div>
  )
}
