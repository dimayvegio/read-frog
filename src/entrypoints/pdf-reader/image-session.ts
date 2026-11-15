import type { RenderedImagePage, TranslatedImagePage } from "./image-pages"
import type { GeneratedImage } from "@/utils/image-translation/generated-schema"
import { MAX_IMAGE_EDIT_BASE64 } from "@/utils/image-translation/generated-schema"

export const MAX_PDF_IMAGE_PAGES = 20
const MAX_CHARS = 96 * 1024 * 1024
type Row = {
  status: "queued" | "rendering" | "generating" | "done" | "error"
  error?: string
  value?: TranslatedImagePage
}
interface Snapshot {
  order: number[]
  rows: Record<number, Row>
  busy: boolean
  message: string
}
interface Dependencies {
  scope: (signal: AbortSignal) => Promise<{ identity: string; current: () => Promise<void> }>
  render: (page: number, signal: AbortSignal) => Promise<RenderedImagePage>
  generate: (image: string, signal: AbortSignal) => Promise<GeneratedImage>
}
/** One explicit sequential job, scoped RAM reuse; never starts work from a view. */
export class PdfImageSession {
  private snapshot: Snapshot = { order: [], rows: {}, busy: false, message: "" }
  private listeners = new Set<() => void>()
  private cache = new Map<number, TranslatedImagePage>()
  private identity = ""
  private job?: AbortController
  private destroyed = false
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.snapshot
  private update(patch: Partial<Snapshot>) {
    if (this.destroyed) return
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }
  private row(page: number, row: Row) {
    this.update({ rows: { ...this.snapshot.rows, [page]: row } })
  }
  cancel() {
    if (!this.job) return
    this.job?.abort()
    this.job = undefined
    this.update({
      busy: false,
      rows: Object.fromEntries(
        Object.entries(this.snapshot.rows).map(([n, row]) => [
          n,
          row.status === "rendering" || row.status === "generating" ? { status: "queued" } : row,
        ]),
      ),
      message:
        "Đã dừng. Các ảnh đã xong vẫn giữ trong phiên; OpenAI có thể đã nhận/tính phí trang đang xử lý.",
    })
  }
  clear() {
    this.cancel()
    this.cache.clear()
    this.identity = ""
    this.update({ order: [], rows: {}, message: "Đã xóa ảnh trong phiên này; chưa gọi API." })
  }
  destroy() {
    this.cancel()
    this.destroyed = true
    this.cache.clear()
    this.listeners.clear()
    this.snapshot = { order: [], rows: {}, busy: false, message: "" }
  }
  async run(pages: number[], dependencies: Dependencies) {
    if (this.job || this.destroyed) return
    if (
      !pages.length ||
      pages.length > MAX_PDF_IMAGE_PAGES ||
      new Set(pages).size !== pages.length ||
      pages.some((n) => !Number.isSafeInteger(n) || n < 1)
    )
      throw new Error("Dải trang ảnh không hợp lệ; tối đa 20 trang/lượt.")
    const job = new AbortController(),
      { signal } = job
    this.job = job
    let number: number | undefined
    const active = () => {
      signal.throwIfAborted()
      if (this.job !== job || this.destroyed) throw new DOMException("Đã dừng", "AbortError")
    }
    this.update({ busy: true, message: "Đang kiểm tra cấu hình…" })
    try {
      const scope = await dependencies.scope(signal)
      active()
      await scope.current()
      active()
      if (this.identity !== scope.identity) {
        this.cache.clear()
        this.identity = scope.identity
      }
      this.update({
        order: pages,
        rows: Object.fromEntries(
          pages.map((page) => [
            page,
            this.cache.has(page)
              ? { status: "done", value: this.cache.get(page) }
              : { status: "queued" },
          ]),
        ),
      })
      for (number of pages) {
        active()
        await scope.current()
        active()
        if (this.cache.has(number)) continue
        const chars = [...this.cache.values()].reduce((n, row) => n + row.result.image.length, 0)
        // Reserve the maximum valid response BEFORE billing; never evict an
        // image the user has paid for just to continue a batch invisibly.
        if (
          this.cache.size >= MAX_PDF_IMAGE_PAGES ||
          chars + MAX_IMAGE_EDIT_BASE64 + 64 > MAX_CHARS
        )
          throw new Error(
            "Đã gần giới hạn RAM (20 ảnh / 96 MiB). Tải kết quả, xóa ảnh trong phiên rồi tạo dải trang tiếp theo; chưa gửi trang này.",
          )
        this.row(number, { status: "rendering" })
        this.update({ message: `Đang tạo ảnh trang ${number} trên máy…` })
        const source = await dependencies.render(number, signal)
        active()
        await scope.current()
        active()
        this.row(number, { status: "generating" })
        this.update({
          message: `OpenAI đang tạo ảnh dịch trang ${number} · ${this.cache.size} ảnh đã xong…`,
        })
        const result = await dependencies.generate(source.image, signal)
        active()
        await scope.current()
        active()
        const value = { page: number, width: source.width, height: source.height, result }
        this.cache.set(number, value)
        this.row(number, { status: "done", value })
      }
      this.update({
        message: `Đã có ${pages.length}/${pages.length} ảnh trang. Xem/tải ảnh, ghép PDF hoặc ZIP trên máy không gọi API. Bấm lại dùng ảnh đã xong trong cùng phiên.`,
      })
    } catch (error) {
      if (this.job === job && !this.destroyed) {
        const message =
          error instanceof Error ? error.message : "Chưa tạo được ảnh trang. Không tự gửi lại."
        if (number && !signal.aborted) this.row(number, { status: "error", error: message })
        this.update({ message: signal.aborted ? "Đã dừng; không tự gửi lại." : message })
      }
    } finally {
      if (this.job === job) {
        this.job = undefined
        this.update({ busy: false })
      }
    }
  }
}
