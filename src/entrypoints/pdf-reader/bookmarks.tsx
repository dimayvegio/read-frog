import type { PdfViewport } from "./viewport"
import type { Bookmark } from "./workspace"
import { useState, useSyncExternalStore } from "react"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { STUDY_COLORS } from "./study-data"
export function PdfBookmarks({ viewport }: { viewport: PdfViewport }) {
  const workspace = viewport.workspace,
    { data, busy, ready } = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot)
  const [edit, setEdit] = useState<Bookmark | null>(null),
    [name, setName] = useState(""),
    [note, setNote] = useState(""),
    [color, setColor] = useState<string>(STUDY_COLORS[0])
  const reset = () => {
    setEdit(null)
    setName("")
    setNote("")
    setColor(STUDY_COLORS[0])
  }
  return (
    <div className="rf-bookmarks">
      <p>
        Đánh dấu đúng trang, vị trí cuộn và thu phóng. Tự nhớ theo nội dung file, kể cả đổi tên PDF.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          const item: Bookmark = {
            ...(edit ?? viewport.snapshot()),
            id: edit?.id ?? getRandomUUID(),
            name: name.trim(),
            note: note.trim(),
            color,
          }
          if (
            await workspace.edit((d) => ({
              ...d,
              bookmarks: [...d.bookmarks.filter((b) => b.id !== item.id), item],
            }))
          )
            reset()
        }}
      >
        <input
          aria-label="Tên bookmark"
          placeholder="Ví dụ: Chương cần ôn"
          maxLength={120}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          aria-label="Ghi chú bookmark"
          placeholder="Ghi chú (tùy chọn)"
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <label>
          Màu{" "}
          <select
            aria-label="Màu bookmark"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          >
            {STUDY_COLORS.map((c, i) => (
              <option key={c} value={c}>
                {["Vàng", "Xanh lá", "Xanh dương", "Đỏ"][i]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy || !ready || !name.trim()}>
          {edit ? "Lưu bookmark" : "Đánh dấu vị trí đang đọc"}
        </button>
        {edit && (
          <button type="button" onClick={reset}>
            Hủy sửa
          </button>
        )}
      </form>
      {!data.bookmarks.length && <p>Chưa có bookmark.</p>}
      {data.bookmarks.map((b) => (
        <article key={b.id} className="rf-bookmark" style={{ borderLeftColor: b.color }}>
          <button
            type="button"
            className="rf-study-result"
            onClick={() => viewport.navigate(b.page, b.offset, b.zoom)}
          >
            <strong>{b.name}</strong>
            <small>
              Trang {b.page} · {Math.round(b.offset * 100)}% trang
            </small>
          </button>
          {b.note && <p>{b.note}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setEdit(b)
              setName(b.name)
              setNote(b.note)
              setColor(b.color)
            }}
          >
            Sửa bookmark
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void workspace.edit((d) => ({
                ...d,
                bookmarks: d.bookmarks.filter((item) => item.id !== b.id),
              }))
            }
          >
            Xóa bookmark
          </button>
        </article>
      ))}
    </div>
  )
}
