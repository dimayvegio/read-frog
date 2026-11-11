import type { TextNote } from "./text-notes"
import type { PdfViewport } from "./viewport"
import { useState, useSyncExternalStore } from "react"
import { TEXT_NOTE_COLORS } from "./text-notes"
export function PdfTextNotePanel({
  viewport,
  draft,
  onDraft,
}: {
  viewport: PdfViewport
  draft: TextNote | null
  onDraft: (note: TextNote | null) => void
}) {
  const state = useSyncExternalStore(viewport.textNotes.subscribe, viewport.textNotes.getSnapshot)
  const history = useSyncExternalStore(viewport.workspace.subscribe, viewport.workspace.getSnapshot)
  return (
    <div className="rf-text-note-panel">
      <p>
        Chọn công cụ Ô chữ rồi bấm trên trang để đặt. Kéo ô và chốt góc để chỉnh vị trí/kích thước;
        bấm đúp để sửa.
      </p>
      {draft && (
        <TextNoteEditor
          key={draft.id}
          draft={draft}
          viewport={viewport}
          done={() => onDraft(null)}
        />
      )}
      <button
        type="button"
        disabled={history.busy}
        onClick={() =>
          void viewport.textNotes
            .reload()
            .then(() => viewport.workspace.reload())
            .catch((e) => viewport.workspace.fail(e))
        }
      >
        Nạp lại ô chữ
      </button>
      {state.data.notes.map((note) => (
        <div className="rf-study-annotation" key={note.id}>
          <button
            type="button"
            onClick={() => {
              onDraft(note)
              viewport.navigate(note.page)
            }}
          >
            Trang {note.page} · {note.text.slice(0, 100)}
          </button>
          <button
            type="button"
            disabled={history.busy}
            onClick={() =>
              void viewport.textNotes.edit((notes) => notes.filter((n) => n.id !== note.id))
            }
          >
            Xóa
          </button>
        </div>
      ))}
    </div>
  )
}
function TextNoteEditor({
  draft,
  viewport,
  done,
}: {
  draft: TextNote
  viewport: PdfViewport
  done: () => void
}) {
  const [existing] = useState(() =>
    viewport.textNotes.getSnapshot().data.notes.some((n) => n.id === draft.id),
  )
  const [text, setText] = useState(draft.text),
    [color, setColor] = useState(draft.color),
    [font, setFont] = useState(draft.font)
  const history = useSyncExternalStore(viewport.workspace.subscribe, viewport.workspace.getSnapshot)
  return (
    <form
      className="rf-note-editor"
      onSubmit={async (e) => {
        e.preventDefault()
        if (
          await viewport.textNotes.edit((notes) => {
            const current = notes.find((n) => n.id === draft.id)
            if (existing && !current) throw new Error("Ô chữ đã bị xóa. Chọn lại trước khi sửa.")
            return [
              ...notes.filter((n) => n.id !== draft.id),
              { ...(current ?? draft), text: text.trim().normalize("NFC"), color, font },
            ]
          })
        )
          done()
      }}
    >
      <label>
        Nội dung
        <textarea
          aria-label="Nội dung ô chữ"
          required
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label>
        Màu
        <select aria-label="Màu ô chữ" value={color} onChange={(e) => setColor(e.target.value)}>
          {TEXT_NOTE_COLORS.map((c, i) => (
            <option value={c} key={c}>
              {["Đen", "Vàng", "Xanh lá", "Xanh dương", "Đỏ"][i]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Cỡ chữ
        <select
          aria-label="Cỡ ô chữ"
          value={font}
          onChange={(e) => setFont(Number(e.target.value))}
        >
          {[0.02, 0.025, 0.03, 0.04, 0.05].map((n, i) => (
            <option value={n} key={n}>
              {["Nhỏ", "Vừa", "Lớn", "Rất lớn", "Tiêu đề"][i]}
            </option>
          ))}
        </select>
      </label>
      <div className="rf-panel-actions">
        <button type="submit" disabled={history.busy || !text.trim()}>
          Lưu ô chữ
        </button>
        <button type="button" onClick={done}>
          Hủy
        </button>
      </div>
    </form>
  )
}
