/* oxlint-disable react/no-array-index-key -- Source row/item coordinates identify fixed cells. A committed block replacement intentionally remounts its editor to discard obsolete drafts. */
import type { ImageBlock, ImageStructure } from "@/utils/image-translation/structure"
import { useState } from "react"

const names = {
  heading: "Tiêu đề",
  paragraph: "Đoạn văn",
  list: "Danh sách",
  table: "Bảng",
  code: "Code / nguyên văn",
}
function BlockView({ block }: { block: ImageBlock }) {
  if (block.type === "code")
    return (
      <pre>
        <code>{block.text}</code>
      </pre>
    )
  if (block.type === "table")
    return (
      <div
        className="rf-structure-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Bảng nhận dạng"
      >
        <table>
          {block.header && (
            <thead>
              <tr>
                {block.rows[0]!.map((s, i) => (
                  <th key={i} scope="col">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {(block.header ? block.rows.slice(1) : block.rows).map((row, r) => (
              <tr key={r}>
                {row.map((s, c) => (
                  <td key={c}>{s}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  if (block.type === "list")
    return block.ordered ? (
      <ol start={block.start}>
        {block.items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    ) : (
      <ul>
        {block.items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    )
  if (block.type === "heading")
    return (
      <p role="heading" aria-level={block.level} className="rf-structure-heading">
        {block.text}
      </p>
    )
  return <p className="rf-structure-paragraph">{block.text}</p>
}
function BlockCard({
  block,
  index,
  disabled,
  canMerge,
  canDelete,
  onChange,
}: {
  block: ImageBlock
  index: number
  disabled: boolean
  canMerge: boolean
  canDelete: boolean
  onChange: (action: "save" | "merge" | "delete", blocks?: ImageBlock[]) => boolean
}) {
  const [draft, setDraft] = useState<ImageBlock | null>(null)
  const [split, setSplit] = useState(false)
  const save = () => {
    if (!draft) return
    const blocks =
      split && draft.type === "paragraph"
        ? draft.text
            .split(/\n\s*\n/u)
            .filter((s) => s.trim())
            .map((text): ImageBlock => ({ type: "paragraph", text }))
        : [draft]
    if (blocks.length && onChange("save", blocks)) {
      setDraft(null)
      setSplit(false)
    }
  }
  return (
    <article className="rf-structure-card" data-block-type={block.type}>
      <header>
        <span>
          <b>{String(index + 1).padStart(2, "0")}</b> {names[block.type]}
          {block.type === "table"
            ? ` · ${block.rows.length} hàng × ${block.rows[0]!.length} cột`
            : ""}
        </span>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Sửa khối ${index + 1}`}
          onClick={() => {
            setDraft(structuredClone(block))
            setSplit(false)
          }}
        >
          Sửa
        </button>
      </header>
      {draft ? (
        <div className="rf-structure-draft">
          {draft.type === "table" ? (
            <div className="rf-structure-table-scroll">
              <table>
                <tbody>
                  {draft.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((s, c) => (
                        <td key={c}>
                          <input
                            aria-label={`Hàng ${r + 1}, cột ${c + 1}`}
                            value={s}
                            maxLength={4000}
                            disabled={disabled}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                rows: draft.rows.map((rr, ri) =>
                                  ri === r
                                    ? rr.map((ss, ci) => (ci === c ? e.target.value : ss))
                                    : rr,
                                ),
                              })
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : draft.type === "list" ? (
            <label>
              Mỗi mục một dòng
              <textarea
                aria-label={`Nội dung khối ${index + 1}`}
                disabled={disabled}
                value={draft.items.join("\n")}
                maxLength={20000}
                onChange={(e) => setDraft({ ...draft, items: e.target.value.split("\n") })}
              />
            </label>
          ) : (
            <label>
              Nội dung
              <textarea
                aria-label={`Nội dung khối ${index + 1}`}
                disabled={disabled}
                value={draft.text}
                maxLength={20000}
                spellCheck={draft.type !== "code"}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              />
            </label>
          )}
          {draft.type === "paragraph" && (
            <label className="rf-structure-check">
              <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
              Tách thành các đoạn tại dòng trống
            </label>
          )}
          <div className="rf-structure-actions">
            <button type="button" disabled={disabled} onClick={save}>
              Lưu chỉnh sửa
            </button>
            <button type="button" disabled={disabled} onClick={() => setDraft(null)}>
              Hủy
            </button>
          </div>
        </div>
      ) : (
        <BlockView block={block} />
      )}
      {!draft && (
        <footer>
          {canMerge && (
            <button type="button" disabled={disabled} onClick={() => onChange("merge")}>
              Gộp với đoạn sau
            </button>
          )}
          <button
            type="button"
            disabled={disabled || !canDelete}
            onClick={() => onChange("delete")}
          >
            Bỏ khối
          </button>
        </footer>
      )}
    </article>
  )
}
export function ImageStructureEditor({
  value,
  disabled,
  onChange,
}: {
  value: ImageStructure
  disabled: boolean
  onChange: (value: ImageStructure) => boolean
}) {
  return (
    <section className="rf-structure-editor" aria-label="Cấu trúc ảnh">
      <h2>
        Cấu trúc nhận dạng <small>{value.blocks.length} khối</small>
      </h2>
      <p className="rf-structure-hint">
        Giữ thứ tự đọc, mục danh sách và ô bảng. Sửa / gộp / tách / bỏ khối trên máy, sau đó bấm
        Dịch lại cấu trúc. Font, màu và ô gộp chưa giữ nguyên như ảnh.
      </p>
      {value.blocks.map((block, index) => (
        <BlockCard
          key={`${index}-${JSON.stringify(block)}`}
          block={block}
          index={index}
          disabled={disabled}
          canMerge={block.type === "paragraph" && value.blocks[index + 1]?.type === "paragraph"}
          canDelete={value.blocks.length > 1}
          onChange={(action, blocks = []) => {
            const next = [...value.blocks]
            if (action === "merge") {
              const following = next[index + 1]
              if (block.type !== "paragraph" || following?.type !== "paragraph") return false
              next.splice(index, 2, { type: "paragraph", text: `${block.text}\n${following.text}` })
            } else next.splice(index, 1, ...(action === "save" ? blocks : []))
            return onChange({ blocks: next })
          }}
        />
      ))}
    </section>
  )
}
