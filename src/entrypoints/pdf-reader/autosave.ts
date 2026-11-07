import type { PdfReadingPosition } from "@/utils/selection-result/reading-position"
import { sendMessage } from "@/utils/message"
// Capture activity time, not flush time: an old tab closing cannot overwrite a
// newer tab. Background owns the transaction so closing the reader is safe.
export class PdfAutosave {
  private pending: PdfReadingPosition | null = null
  private debounce?: ReturnType<typeof setTimeout>
  private deadline?: ReturnType<typeof setTimeout>
  private stamp = 0
  private paused = false
  constructor(
    private epoch: number,
    private status: (text: string) => void,
  ) {}
  record(position: Omit<PdfReadingPosition, "updatedAt">) {
    if (this.paused) return
    this.stamp = Math.max(Date.now(), this.stamp + 1)
    this.pending = { ...position, updatedAt: this.stamp }
    this.status("Đang lưu vị trí…")
    clearTimeout(this.debounce)
    this.debounce = setTimeout(() => this.flush(), 300)
    this.deadline ??= setTimeout(() => this.flush(), 1500)
  }
  flush = () => {
    clearTimeout(this.debounce)
    clearTimeout(this.deadline)
    this.deadline = undefined
    const position = this.pending
    this.pending = null
    if (!position || this.paused) return
    void sendMessage("savePdfReadingPosition", { position, epoch: this.epoch })
      .then((result) => {
        if (this.paused) return
        if (result === "cleared") {
          this.paused = true
          this.status("Vị trí đã bị xóa ở cửa sổ khác. Mở lại file để tiếp tục tự lưu.")
        } else if (!this.paused)
          this.status(
            result === "saved" ? "Đã tự lưu trên máy" : "Cửa sổ khác đã lưu vị trí mới hơn",
          )
      })
      .catch(() => {
        if (!this.paused) this.status("Chưa lưu được vị trí. Cuộn lại để thử.")
      })
  }
  stop() {
    this.flush()
    this.paused = true
  }
}
