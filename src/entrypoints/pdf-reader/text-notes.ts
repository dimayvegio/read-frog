import { validBox, STUDY_COLORS, type Box } from "./study-data"
import { pdfWorkspaceDB, type PdfWorkspace } from "./workspace"
export const TEXT_NOTE_COLORS = ["#17212e", ...STUDY_COLORS]
export type TextNote = Box & { id: string; page: number; text: string; color: string; font: number }
export type TextNoteDocument = { id: string; revision: number; notes: TextNote[] }
export function validateTextNotes(data: TextNoteDocument) {
  if (
    !/^[a-f0-9]{64}$/u.test(data.id) ||
    !Number.isSafeInteger(data.revision) ||
    data.revision < 0 ||
    !Array.isArray(data.notes) ||
    data.notes.length > 500
  )
    throw new Error("Dữ liệu ô chữ không hợp lệ (tối đa 500 ô/file).")
  const ids = new Set<string>()
  for (const note of data.notes) {
    if (
      !note.id ||
      note.id.length > 120 ||
      ids.has(note.id) ||
      !Number.isInteger(note.page) ||
      note.page < 1 ||
      note.page > 20000 ||
      !validBox(note) ||
      typeof note.text !== "string" ||
      !note.text.trim() ||
      note.text.length > 2000 ||
      !TEXT_NOTE_COLORS.includes(note.color) ||
      !Number.isFinite(note.font) ||
      note.font < 0.01 ||
      note.font > 0.08
    )
      throw new Error("Ô chữ không hợp lệ.")
    ids.add(note.id)
  }
  if (JSON.stringify(data).length > 1_000_000) throw new Error("Ô chữ vượt giới hạn lưu của file.")
  return data
}
export class PdfTextNotes {
  private state: { data: TextNoteDocument; ready: boolean }
  private listeners = new Set<() => void>()
  private closed = false
  constructor(
    id: string,
    private workspace: PdfWorkspace,
  ) {
    this.state = { data: { id, revision: 0, notes: [] }, ready: false }
    void this.reload().catch((error) => workspace.fail(error))
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.state
  async reload() {
    const data = validateTextNotes(
      (await pdfWorkspaceDB.textNotes.get(this.state.data.id)) ?? {
        id: this.state.data.id,
        revision: 0,
        notes: [],
      },
    )
    if (!this.closed) {
      this.state = { data, ready: true }
      this.listeners.forEach((fn) => fn())
    }
  }
  private async replace(notes: TextNote[], current = () => true) {
    const before = this.state.data,
      data = validateTextNotes({ ...before, revision: before.revision + 1, notes })
    const check = () => {
      if (this.closed || !current()) throw new Error("Đã dừng chỉnh ô chữ.")
    }
    check()
    await pdfWorkspaceDB.transaction("rw", pdfWorkspaceDB.textNotes, async () => {
      const stored = await pdfWorkspaceDB.textNotes.get(data.id)
      if ((stored?.revision ?? 0) !== before.revision)
        throw new Error("Ô chữ đã đổi ở cửa sổ khác. Nạp lại ô chữ trước khi sửa.")
      if (!stored && (await pdfWorkspaceDB.textNotes.count()) >= 100)
        throw new Error("Đã lưu ô chữ của 100 PDF.")
      check()
      await pdfWorkspaceDB.textNotes.put(data)
      check()
    })
    this.state = { data, ready: true }
    this.listeners.forEach((fn) => fn())
    return true
  }
  edit(change: (notes: TextNote[]) => TextNote[], current = () => true) {
    return this.workspace.perform(async () => {
      if (!this.state.ready) throw new Error("Chưa nạp xong ô chữ.")
      const before = this.state.data.notes,
        after = change(before)
      await this.replace(after, current)
      return {
        undo: () => this.replace(before),
        redo: () => this.replace(after),
        bytes: JSON.stringify(before).length + JSON.stringify(after).length,
      }
    })
  }
  destroy() {
    this.closed = true
    this.listeners.clear()
  }
}
