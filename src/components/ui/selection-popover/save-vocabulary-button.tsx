import { IconBookmark, IconLoader2, IconBook2 } from "@tabler/icons-react"
import { useEffect, useRef, useState } from "react"
import { createPortStreamPromise } from "@/utils/content-script/port-streaming"
import { sendMessage } from "@/utils/message"
import {
  VOCABULARY_PORT,
  type VocabularyCapture,
  type VocabularySaveEvent,
} from "@/utils/vocabulary/schema"

export function SaveVocabularyButton({ capture }: { capture: VocabularyCapture }) {
  return <SaveVocabularyOperation key={JSON.stringify(capture)} capture={capture} />
}

function SaveVocabularyOperation({ capture }: { capture: VocabularyCapture }) {
  const [status, setStatus] = useState("")
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const valid = !!capture.word.trim() && capture.word.length <= 160
  const save = async () => {
    const abort = new AbortController()
    controller.current = abort
    setPending(true)
    setStatus("Đang tạo nội dung bằng OpenAI…")
    try {
      const result = await createPortStreamPromise<VocabularySaveEvent>(VOCABULARY_PORT, capture, {
        signal: abort.signal,
        onChunk: (e) =>
          setStatus(
            e.stage === "text"
              ? "Đang tạo nghĩa và ví dụ…"
              : e.stage === "word-audio"
                ? "Đang tạo giọng đọc từ…"
                : "Đang tạo giọng đọc ví dụ…",
          ),
      })
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
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="flex min-h-8 items-center gap-1 rounded-md px-2 text-xs hover:bg-muted disabled:opacity-50"
          disabled={!valid || pending || saved}
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
