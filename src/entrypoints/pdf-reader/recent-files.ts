import { Dexie, type Table } from "dexie"

export type PdfFileHandle = {
  kind: "file"
  name: string
  getFile: () => Promise<File>
  queryPermission: (options: { mode: "read" }) => Promise<PermissionState>
  requestPermission: (options: { mode: "read" }) => Promise<PermissionState>
}
export type RecentPdf = {
  id: string
  title: string
  size: number
  openedAt: number
  handle?: PdfFileHandle
}
class RecentFilesDB extends Dexie {
  files!: Table<RecentPdf, string>
  constructor() {
    super("read-frog-pdf-recents")
    this.version(1).stores({ files: "id, openedAt" })
  }
}
export const recentFilesDB = new RecentFilesDB()
export async function listRecentPdfs() {
  return (await recentFilesDB.files.orderBy("openedAt").reverse().limit(20).toArray()).filter(
    (row) =>
      /^[a-f0-9]{64}$/u.test(row.id) &&
      typeof row.title === "string" &&
      row.title.length <= 240 &&
      Number.isFinite(row.size) &&
      Number.isFinite(row.openedAt),
  )
}
export async function rememberPdf(
  id: string,
  title: string,
  size: number,
  handle: PdfFileHandle | undefined,
  current: () => boolean,
) {
  if (
    !/^[a-f0-9]{64}$/u.test(id) ||
    !Number.isSafeInteger(size) ||
    size < 0 ||
    size > 200 * 1024 * 1024
  )
    throw new Error("Thông tin PDF không hợp lệ.")
  await recentFilesDB.transaction("rw", recentFilesDB.files, async () => {
    if (!current()) return
    const previous = await recentFilesDB.files.get(id)
    const row: RecentPdf = {
      id,
      title: (title.split(/[\\/]/u).at(-1) ?? "PDF").replace(/\p{Cc}/gu, " ").slice(0, 240),
      size,
      openedAt: Date.now(),
    }
    if (handle ?? previous?.handle) row.handle = handle ?? previous?.handle
    if (!current()) return
    await recentFilesDB.files.put(row)
    const stale = await recentFilesDB.files.orderBy("openedAt").reverse().offset(20).primaryKeys()
    await recentFilesDB.files.bulkDelete(stale)
    if (!current()) throw new Error("Đã đổi tài liệu; dừng ghi danh sách gần đây.")
  })
}
export function pdfPicker() {
  return (
    window as typeof window & {
      showOpenFilePicker?: (options: unknown) => Promise<PdfFileHandle[]>
    }
  ).showOpenFilePicker
}
