import type { PdfParagraph } from "./paragraphs"
import type { ViewPosition } from "./viewport"
import { Dexie, type Table } from "dexie"
import { validBox, STUDY_COLORS } from "./study-data"

export type InkStyle = { width: number; opacity: number; fill: string }
export type Bookmark = ViewPosition & { id: string; name: string; note: string; color: string }
export type ParagraphLayout = { page: number; source: string; paragraphs: PdfParagraph[] }
export type WorkspaceData = {
  id: string
  revision: number
  styles: Record<string, InkStyle>
  bookmarks: Bookmark[]
  layouts: ParagraphLayout[]
}
type Action = { undo: () => Promise<boolean>; redo: () => Promise<boolean>; bytes?: number }
const color = (s: string) => STUDY_COLORS.includes(s as (typeof STUDY_COLORS)[number])
const unit = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1
export const emptyWorkspace = (id: string): WorkspaceData => ({
  id,
  revision: 0,
  styles: {},
  bookmarks: [],
  layouts: [],
})
export function validateWorkspace(data: WorkspaceData) {
  if (
    !/^[a-f0-9]{64}$/.test(data.id) ||
    !Number.isSafeInteger(data.revision) ||
    data.revision < 0 ||
    !data.styles ||
    typeof data.styles !== "object" ||
    Array.isArray(data.styles) ||
    Object.keys(data.styles).length > 4000 ||
    !Array.isArray(data.bookmarks) ||
    data.bookmarks.length > 500 ||
    !Array.isArray(data.layouts) ||
    data.layouts.length > 100
  )
    throw new Error("Dữ liệu PDF mở rộng không hợp lệ hoặc vượt giới hạn.")
  for (const [id, s] of Object.entries(data.styles)) {
    if (
      !id ||
      id.length > 120 ||
      !s ||
      !Number.isFinite(s.width) ||
      s.width < 1 ||
      s.width > 8 ||
      !unit(s.opacity) ||
      s.opacity < 0.1 ||
      !(s.fill === "none" || color(s.fill))
    )
      throw new Error("Kiểu nét vẽ không hợp lệ.")
  }
  const ids = new Set<string>(),
    pages = new Set<number>()
  for (const b of data.bookmarks) {
    if (
      !b.id ||
      ids.has(b.id) ||
      b.id.length > 120 ||
      !Number.isInteger(b.page) ||
      b.page < 1 ||
      b.page > 20000 ||
      !unit(b.offset) ||
      !(b.zoom === "fit-width" || (Number.isFinite(b.zoom) && b.zoom >= 0.1 && b.zoom <= 4)) ||
      typeof b.name !== "string" ||
      !b.name.trim() ||
      b.name.length > 120 ||
      typeof b.note !== "string" ||
      b.note.length > 2000 ||
      !color(b.color)
    )
      throw new Error("Bookmark không hợp lệ.")
    ids.add(b.id)
  }
  for (const layout of data.layouts) {
    if (
      !Number.isInteger(layout.page) ||
      layout.page < 1 ||
      layout.page > 20000 ||
      pages.has(layout.page) ||
      !/^[a-f0-9]{64}$/.test(layout.source) ||
      !Array.isArray(layout.paragraphs) ||
      layout.paragraphs.length > 120
    )
      throw new Error("Bố cục đoạn không hợp lệ.")
    pages.add(layout.page)
    const paragraphs = new Set<string>()
    for (const p of layout.paragraphs) {
      if (
        !p.id ||
        p.id.length > 120 ||
        paragraphs.has(p.id) ||
        p.page !== layout.page ||
        !Number.isInteger(p.index) ||
        p.index < 0 ||
        typeof p.text !== "string" ||
        !p.text.trim() ||
        p.text.length > 20000 ||
        !validBox(p) ||
        !(p.excluded === undefined || typeof p.excluded === "boolean")
      )
        throw new Error("Đoạn đã chỉnh không hợp lệ.")
      paragraphs.add(p.id)
    }
  }
  if (JSON.stringify(data).length > 2_000_000)
    throw new Error("Dữ liệu mở rộng vượt 2 MB/file; bớt các trang đã chỉnh trước khi lưu.")
  return data
}
class WorkspaceDatabase extends Dexie {
  documents!: Table<WorkspaceData, string>
  constructor() {
    super("read-frog-pdf-workspace")
    this.version(1).stores({ documents: "id" })
  }
}
const db = new WorkspaceDatabase()
export async function loadWorkspace(id: string) {
  return validateWorkspace((await db.documents.get(id)) ?? emptyWorkspace(id))
}
export async function saveWorkspace(
  before: WorkspaceData,
  next: WorkspaceData,
  current = () => true,
) {
  const check = () => {
    if (!current()) throw new Error("Tác vụ PDF đã dừng; không lưu thay đổi muộn.")
  }
  check()
  const value = validateWorkspace({ ...next, id: before.id, revision: before.revision + 1 })
  await db.transaction("rw", db.documents, async () => {
    const stored = await db.documents.get(before.id)
    if ((stored?.revision ?? 0) !== before.revision)
      throw new Error("PDF đã được sửa ở cửa sổ khác. Nạp lại dữ liệu PDF rồi thử lại.")
    if (!stored && (await db.documents.count()) >= 100)
      throw new Error("Đã lưu dữ liệu mở rộng của 100 PDF.")
    check()
    await db.documents.put(value)
    check()
  })
  return value
}

/** A document-owned command history shared by annotations and the additive sidecar. */
export class PdfWorkspace {
  private state: {
    data: WorkspaceData
    ready: boolean
    busy: boolean
    undo: number
    redo: number
    error: string
  }
  private listeners = new Set<() => void>()
  private past: Action[] = []
  private future: Action[] = []
  private destroyed = false
  constructor(id: string) {
    this.state = {
      data: emptyWorkspace(id),
      ready: false,
      busy: false,
      undo: 0,
      redo: 0,
      error: "",
    }
    void loadWorkspace(id)
      .then((data) => {
        if (!this.destroyed) this.publish({ data, ready: true })
      })
      .catch((error) => this.fail(error))
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.state
  private publish(next: Partial<typeof this.state>) {
    if (this.destroyed) return
    this.state = { ...this.state, ...next, undo: this.past.length, redo: this.future.length }
    this.listeners.forEach((listener) => listener())
  }
  fail(error: unknown) {
    this.publish({ error: error instanceof Error ? error.message : "Không lưu được dữ liệu PDF." })
  }
  async perform(work: () => Promise<Action | null>) {
    if (this.destroyed || !this.state.ready || this.state.busy) return false
    this.publish({ busy: true, error: "" })
    try {
      const action = await work()
      if (this.destroyed) return false
      if (action) {
        this.past.push(action)
        while (
          this.past.length > 50 ||
          (this.past.length > 1 &&
            this.past.reduce((n, a) => n + (a.bytes ?? 0), 0) > 8 * 1024 * 1024)
        )
          this.past.shift()
        this.future = []
      }
      return true
    } catch (error) {
      this.fail(error)
      return false
    } finally {
      this.publish({ busy: false })
    }
  }
  async replaceRaw(next: WorkspaceData, current = () => true) {
    const data = await saveWorkspace(this.state.data, next, () => !this.destroyed && current())
    this.publish({ data })
    return true
  }
  edit(change: (data: WorkspaceData) => WorkspaceData, current = () => true) {
    return this.perform(async () => {
      const before = this.state.data,
        after = change(before)
      if (JSON.stringify(before) === JSON.stringify(after)) return null
      await this.replaceRaw(after, current)
      return {
        undo: () => this.replaceRaw(before),
        redo: () => this.replaceRaw(after),
        bytes: JSON.stringify(before).length + JSON.stringify(after).length,
      }
    })
  }
  async reverse(direction: "undo" | "redo") {
    if (this.state.busy || this.destroyed) return false
    const from = direction === "undo" ? this.past : this.future,
      to = direction === "undo" ? this.future : this.past,
      action = from.at(-1)
    if (!action) return false
    this.publish({ busy: true, error: "" })
    try {
      if (!(await action[direction]())) return false
      from.pop()
      to.push(action)
      return true
    } catch (error) {
      this.fail(error)
      return false
    } finally {
      this.publish({ busy: false })
    }
  }
  async reload() {
    if (this.state.busy || this.destroyed) return
    this.publish({ busy: true })
    try {
      const data = await loadWorkspace(this.state.data.id)
      this.past = []
      this.future = []
      this.publish({ data, ready: true, error: "" })
    } catch (error) {
      this.fail(error)
    } finally {
      this.publish({ busy: false })
    }
  }
  destroy() {
    this.destroyed = true
    this.past = []
    this.future = []
    this.listeners.clear()
  }
}
