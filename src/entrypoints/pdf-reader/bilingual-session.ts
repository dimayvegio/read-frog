import type { PdfParagraph } from "./paragraphs"
import type { Config } from "@/types/config/config"
import type { PdfDocument } from "@/utils/selection-result/pdf-history"
import { DEFAULT_PDF_TEXT_OPTIONS, type PdfTextOptions } from "@/utils/selection-result/pdf-text"
import { translateNativeSelection } from "@/utils/selection-result/translate"
export interface ParagraphTranslation {
  page: number
  output: string
  complete: string
  status: "idle" | "loading" | "done" | "error"
  error?: string
  cacheNote?: string
}
export interface BilingualTranslations {
  rows: Record<string, ParagraphTranslation>
  busy: boolean
  message: string
}
export const translationConfigIdentity = (config: Config) =>
  JSON.stringify({ ...config, tts: undefined })
/** One bounded, cancelable page queue. Completed translations persist in the existing PDF cache. */
export class PdfBilingualSession {
  private state: BilingualTranslations = { rows: {}, busy: false, message: "" }
  private listeners = new Set<() => void>()
  private work: AbortController | null = null
  private restore: AbortController | null = null
  private page = 0
  private paragraphs: PdfParagraph[] = []
  private pages: number[] = []
  private destroyed = false
  constructor(
    private config: Config,
    private document: PdfDocument,
    private current: () => Promise<boolean>,
    private stale: () => void,
    private translate = translateNativeSelection,
    private textOptions: PdfTextOptions = DEFAULT_PDF_TEXT_OPTIONS,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.state
  private publish(update: Partial<BilingualTranslations>) {
    if (!this.destroyed) {
      this.state = { ...this.state, ...update }
      this.listeners.forEach((listener) => listener())
    }
  }
  private row(id: string, value: ParagraphTranslation) {
    const rows = { ...this.state.rows, [id]: value }
    if (
      Object.values(rows).reduce(
        (sum, item) => sum + item.output.length + item.complete.length,
        0,
      ) >
      2 * 1024 * 1024
    )
      throw new Error("Bản dịch quá dài; hãy chọn ít đoạn hơn.")
    this.publish({ rows })
  }
  setPage(page: number, paragraphs: PdfParagraph[]) {
    if (page !== this.page || paragraphs !== this.paragraphs) {
      this.cancel()
      this.restore?.abort()
      this.page = page
      this.publish({ message: "" })
    }
    this.paragraphs = paragraphs
    this.pages = [...this.pages.filter((item) => item !== page), page].slice(-5)
    const rows = Object.fromEntries(
      Object.entries(this.state.rows).filter(
        ([id, row]) =>
          this.pages.includes(row.page) &&
          (row.page !== page || paragraphs.some((p) => p.id === id)),
      ),
    )
    this.publish({ rows })
  }
  async restoreCache() {
    if (this.destroyed || this.work || !this.paragraphs.length) return
    this.restore?.abort()
    const controller = new AbortController(),
      { signal } = controller
    this.restore = controller
    try {
      for (const paragraph of this.paragraphs) {
        if (paragraph.excluded) continue
        signal.throwIfAborted()
        if (this.state.rows[paragraph.id]?.output) continue
        const result = await this.translate({
          text: paragraph.text,
          config: this.config,
          document: this.document,
          textOptions: this.textOptions,
          signal,
          cacheOnly: true,
          onChunk: () => {},
        })
        signal.throwIfAborted()
        if (result.output && result.output.length <= 60000)
          this.row(paragraph.id, {
            page: paragraph.page,
            output: result.output,
            complete: result.output,
            status: "done",
          })
      }
      if (!signal.aborted) {
        const current = await this.current()
        if (!signal.aborted && !current) this.invalidate()
      }
    } catch {
      /* A cache miss/storage error is never permission to call the model. */
    } finally {
      if (this.restore === controller) this.restore = null
    }
  }
  cancel() {
    this.work?.abort()
    this.work = null
    this.restore?.abort()
    this.restore = null
    const rows = Object.fromEntries(
      Object.entries(this.state.rows).map(([id, row]) => [
        id,
        row.status === "loading"
          ? {
              ...row,
              output: row.complete,
              status: row.complete ? ("done" as const) : ("idle" as const),
            }
          : row,
      ]),
    )
    this.publish({
      rows,
      busy: false,
      ...(this.state.busy ? { message: "Đã dừng dịch. Các đoạn đã xong vẫn được giữ." } : {}),
    })
  }
  private invalidate() {
    this.cancel()
    this.publish({
      rows: {},
      message: "Cấu hình hoặc lịch sử đã thay đổi. Đang kiểm tra lại cache trên máy…",
    })
    this.stale()
  }
  async translatePage(id?: string, regenerate = false) {
    if (this.destroyed || this.work || !this.paragraphs.length) return
    this.restore?.abort()
    const paragraphs = this.paragraphs.filter(
      (item) =>
        !item.excluded &&
        (!id || item.id === id) &&
        (regenerate || this.state.rows[item.id]?.status !== "done"),
    )
    if (!paragraphs.length) {
      this.publish({
        message: this.paragraphs.every((p) => p.excluded)
          ? "Tất cả đoạn trên trang đang được bỏ qua. Bật Chỉnh đoạn để cho dịch lại."
          : "Các đoạn trên trang đã có bản dịch. Có thể chọn Dịch lại ở từng đoạn.",
      })
      return
    }
    const controller = new AbortController(),
      { signal } = controller
    this.work = controller
    this.publish({
      busy: true,
      message: `Đang dịch trang ${this.page} · 0/${paragraphs.length} đoạn`,
    })
    try {
      if (!(await this.current())) {
        this.invalidate()
        return
      }
      for (const [index, paragraph] of paragraphs.entries()) {
        signal.throwIfAborted()
        const complete = this.state.rows[paragraph.id]?.complete ?? ""
        let cacheNote = ""
        this.row(paragraph.id, {
          page: paragraph.page,
          output: complete,
          complete,
          status: "loading",
        })
        try {
          const result = await this.translate({
            text: paragraph.text,
            config: this.config,
            document: this.document,
            textOptions: this.textOptions,
            signal,
            bypassCache: regenerate,
            onCacheState: (state, message) => {
              cacheNote =
                state === "not-saved"
                  ? (message ?? "Đã dịch nhưng chưa lưu được cache.")
                  : state === "cached"
                    ? "Dùng cache trên máy."
                    : "Đã lưu cache trên máy."
            },
            onChunk: (chunk) => {
              if (signal.aborted) return
              if (chunk.output.length > 60000)
                throw new Error("Bản dịch đoạn vượt giới hạn 60.000 ký tự.")
              this.row(paragraph.id, {
                page: paragraph.page,
                output: chunk.output,
                complete,
                status: "loading",
              })
            },
          })
          signal.throwIfAborted()
          if (!(await this.current())) {
            this.invalidate()
            return
          }
          signal.throwIfAborted()
          if (!result.output.trim() || result.output.length > 60000)
            throw new Error("Bản dịch rỗng hoặc quá dài. Thử chọn đoạn nhỏ hơn.")
          this.row(paragraph.id, {
            page: paragraph.page,
            output: result.output,
            complete: result.output,
            status: "done",
            cacheNote,
          })
          this.publish({
            message: `Trang ${this.page} · đã dịch ${index + 1}/${paragraphs.length} đoạn`,
          })
        } catch (error) {
          if (signal.aborted) return
          const message = error instanceof Error ? error.message : "Không dịch được đoạn này."
          this.row(paragraph.id, {
            page: paragraph.page,
            output: complete,
            complete,
            status: "error",
            error: message,
          })
          this.publish({
            message: `Đã dừng tại đoạn ${paragraph.index + 1}. Các đoạn đã xong vẫn được giữ.`,
          })
          return
        }
      }
    } catch {
      if (!signal.aborted)
        this.publish({ message: "Chưa dịch được trang. Kiểm tra OpenAI rồi thử lại." })
    } finally {
      if (this.work === controller) {
        this.work = null
        this.publish({ busy: false })
      }
    }
  }
  destroy() {
    this.cancel()
    this.destroyed = true
    this.listeners.clear()
  }
}
