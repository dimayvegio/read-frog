import type { BilingualSnapshot } from "./paragraph-layer"
import type { PdfParagraph } from "./paragraphs"
import type { PdfViewport } from "./viewport"
import { useEffect, useState } from "react"
import { mergeParagraphs } from "./paragraph-edits"

export function mergeSelectedParagraphs(items: PdfParagraph[], ids: string[]) {
  const indices = items.flatMap((p, i) => (ids.includes(p.id) ? [i] : []))
  if (
    indices.length < 2 ||
    indices.length !== ids.length ||
    indices.some((n, i) => i > 0 && n !== indices[i - 1]! + 1)
  )
    throw new Error("Chọn ít nhất hai đoạn liền nhau trong cùng trang để gộp.")
  let result = items,
    id = items[indices[0]!]!.id
  for (let i = 1; i < indices.length; i++) {
    result = mergeParagraphs(result, id)
    id = result[indices[0]!]!.id
  }
  return result
}
export function useParagraphSelection(
  viewport: PdfViewport,
  snapshot: BilingualSnapshot,
  busy: boolean,
) {
  const [selection, setSelection] = useState<{ source: PdfParagraph[]; ids: string[] }>({
    source: [],
    ids: [],
  })
  const [menu, setMenu] = useState<{
    x: number
    y: number
    source: PdfParagraph[]
    ids: string[]
  } | null>(null)
  const ids = selection.source === snapshot.paragraphs ? selection.ids : []
  const toggle = (id: string) =>
    setSelection((old) => {
      const selected = old.source === snapshot.paragraphs ? old.ids : []
      return {
        source: snapshot.paragraphs,
        ids: selected.includes(id) ? selected.filter((n) => n !== id) : [...selected, id],
      }
    })
  const context = (id: string, x: number, y: number) => {
    const selected = ids.includes(id) ? ids : [id]
    setSelection({ source: snapshot.paragraphs, ids: selected })
    setMenu({
      x: Math.max(8, Math.min(innerWidth - 230, x)),
      y: Math.max(8, Math.min(innerHeight - 165, y)),
      source: snapshot.paragraphs,
      ids: selected,
    })
  }
  useEffect(() => {
    for (const node of viewport.element.querySelectorAll<HTMLElement>("[data-paragraph-id]"))
      node.classList.toggle("multi-selected", ids.includes(node.dataset.paragraphId ?? ""))
    const action = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; x?: number; y?: number }>).detail
      if (!snapshot.paragraphs.some((p) => p.id === detail.id)) return
      if (detail.x !== undefined) context(detail.id, detail.x, detail.y ?? 0)
      else toggle(detail.id)
    }
    const close = (e: Event) => {
      if (!(e.target instanceof Element) || !e.target.closest(".rf-paragraph-context"))
        setMenu(null)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null)
        setSelection({ source: [], ids: [] })
      }
    }
    viewport.element.addEventListener("rf-paragraph-action", action)
    window.addEventListener("pointerdown", close)
    window.addEventListener("keydown", key)
    window.addEventListener("resize", close)
    return () => {
      viewport.element.removeEventListener("rf-paragraph-action", action)
      window.removeEventListener("pointerdown", close)
      window.removeEventListener("keydown", key)
      window.removeEventListener("resize", close)
      for (const node of viewport.element.querySelectorAll(".multi-selected"))
        node.classList.remove("multi-selected")
    }
  })
  const apply = (merge: boolean) => {
    if (!menu || menu.source !== viewport.paragraphs.getSnapshot().paragraphs || busy) return
    try {
      const next = merge
        ? mergeSelectedParagraphs(menu.source, menu.ids)
        : menu.source.filter((p) => !menu.ids.includes(p.id)).map((p, index) => ({ ...p, index }))
      void viewport.paragraphs.changeLayout(next)
      setMenu(null)
      setSelection({ source: [], ids: [] })
    } catch (error) {
      viewport.workspace.fail(error)
      setMenu(null)
    }
  }
  let canMerge = false
  if (menu)
    try {
      mergeSelectedParagraphs(menu.source, menu.ids)
      canMerge = true
    } catch {
      /* Non-contiguous selections can still be removed. */
    }
  return {
    ids,
    toggle,
    context,
    clear: () => setSelection({ source: [], ids: [] }),
    popup:
      menu && menu.source === snapshot.paragraphs ? (
        <div
          role="menu"
          aria-label="Thao tác các đoạn đã chọn"
          className="rf-paragraph-context"
          style={{ left: menu.x, top: menu.y }}
        >
          <strong>{menu.ids.length} đoạn đã chọn</strong>
          <button
            type="button"
            role="menuitem"
            disabled={busy || !canMerge}
            onClick={() => apply(true)}
          >
            Gộp các đoạn đã chọn
          </button>
          <button type="button" role="menuitem" disabled={busy} onClick={() => apply(false)}>
            Xóa phần nhận diện đã chọn
          </button>
          <small>Ctrl+bấm để chọn nhiều · Ctrl+Z hoàn tác</small>
        </div>
      ) : null,
  }
}
