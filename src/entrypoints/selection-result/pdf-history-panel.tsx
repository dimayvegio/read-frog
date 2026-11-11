import { LANGUAGE_ENGLISH_NAMES } from "@read-frog/definitions"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import {
  clearPdfHistory,
  listPdfHistory,
  type PdfDocument,
  type PdfHistoryRecord,
} from "@/utils/selection-result/pdf-history"

export const pdfLanguageName = (code: string) =>
  LANGUAGE_ENGLISH_NAMES[code as keyof typeof LANGUAGE_ENGLISH_NAMES] ?? code

export function PdfHistoryPanel({
  document,
  revision,
  onSelect,
  onClear,
}: {
  document: PdfDocument
  revision: number
  onSelect: (record: PdfHistoryRecord) => void
  onClear: () => void
}) {
  const [records, setRecords] = useState<PdfHistoryRecord[]>([]),
    [error, setError] = useState(""),
    [limit, setLimit] = useState(20),
    [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let disposed = false
    void listPdfHistory(document.id)
      .then((value) => {
        if (!disposed) {
          setRecords(value)
          setError("")
        }
      })
      .catch(() => {
        if (!disposed) setError("Chưa mở được lịch sử trên máy.")
      })
    return () => {
      disposed = true
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- refresh on a completed write or explicit clear, even when the document ID is unchanged.
  }, [document.id, revision, refresh])
  const exportHistory = () => {
    const file = new Blob(
      [
        JSON.stringify(
          {
            format: "read-frog-pdf-history",
            version: 1,
            exportedAt: Date.now(),
            document,
            records,
          },
          null,
          2,
        ),
      ],
      { type: "application/json;charset=utf-8" },
    )
    const url = URL.createObjectURL(file),
      link = window.document.createElement("a")
    link.href = url
    link.download = `ReadFrog-PDF-${document.id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <details
      className="max-h-[45vh] shrink-0 overflow-y-auto border-b px-4 py-3"
      data-testid="pdf-history"
    >
      <summary className="cursor-pointer text-sm font-medium">
        Lịch sử tài liệu ({records.length} đoạn)
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        Lưu trên máy; tối đa 1.000 đoạn / 32 MiB cho toàn bộ lịch sử PDF. Xuất JSON có cả đoạn gốc
        và bản dịch, không chứa đường dẫn file hoặc API key.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!records.length || busy}
          onClick={exportHistory}
        >
          Xuất lịch sử JSON
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!records.length || busy}
          onClick={() => {
            if (
              !window.confirm(
                `Xóa lịch sử và cache của “${document.title}”? Từ vựng và các tài liệu khác vẫn được giữ.`,
              )
            )
              return
            setBusy(true)
            onClear()
            void clearPdfHistory(document)
              .then(() => setRefresh((value) => value + 1))
              .catch(() => setError("Chưa xóa được lịch sử."))
              .finally(() => setBusy(false))
          }}
        >
          Xóa lịch sử tài liệu
        </Button>
      </div>
      <ol className="mt-3 space-y-2">
        {records.slice(0, limit).map((record) => (
          <li key={record.id} className="rounded-md border p-2">
            <button
              type="button"
              className="w-full cursor-pointer text-left text-sm break-words"
              onClick={() => onSelect(record)}
            >
              <span className="block text-xs text-muted-foreground">
                {new Date(record.updatedAt).toLocaleString()} ·{" "}
                {pdfLanguageName(record.targetLanguage)} · {record.model}
              </span>
              <span className="mt-1 block">
                {record.prepared.slice(0, 160)}
                {record.prepared.length > 160 ? "…" : ""}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {records.length > limit && (
        <Button
          className="mt-2"
          size="sm"
          variant="outline"
          onClick={() => setLimit((value) => value + 20)}
        >
          Xem thêm
        </Button>
      )}
      {!records.length && !error && (
        <p className="mt-2 text-sm text-muted-foreground">
          Chưa có bản dịch đã lưu cho tài liệu này.
        </p>
      )}
    </details>
  )
}
