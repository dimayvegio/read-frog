import type { LiveRow, LiveTranslation } from "./source-view"
import { MAX_TRANSCRIPT } from "./schema"

export type TranslationInput = { id: number; source: string; context: string }
export type TranslateLive = (
  rows: TranslationInput[],
  target: LiveTranslation["target"],
  signal: AbortSignal,
) => Promise<string[]>

/** Bounded recent turns. Offscreen's full original transcript remains authoritative. */
export function recentLiveRows(text: string): TranslationInput[] {
  const rows: TranslationInput[] = []
  let offset = 0,
    size = 0
  for (const part of text.split("\n\n")) {
    let start = offset
    while (start < offset + part.length) {
      let end = Math.min(start + 4000, offset + part.length)
      if (end < offset + part.length) {
        const space = text.lastIndexOf(" ", end - 1)
        if (space > start + 2000) end = space + 1
        // Do not split a UTF-16 surrogate pair.
        if (/[\uD800-\uDBFF]/.test(text[end - 1]!)) end--
      }
      const source = text.slice(start, end)
      if (source.trim()) {
        rows.push({ id: start, source, context: text.slice(Math.max(0, start - 4000), start) })
        size += source.length
        while (rows.length > 24 || size > 16000) size -= rows.shift()!.source.length
      }
      start = end
    }
    offset += part.length + 2
  }
  return rows
}

export class LiveTranslationController {
  private inputs: TranslationInput[] = []
  private full = ""
  private jobs = new Set<AbortController>()
  private epoch = 0
  private disposed = false
  private value: LiveTranslation = {
    enabled: false,
    target: "vi",
    rows: [],
    message: "",
    failed: false,
  }
  constructor(
    private translate: TranslateLive,
    private changed: (value: LiveTranslation) => void,
  ) {}
  get snapshot(): LiveTranslation {
    return { ...this.value, rows: this.value.rows.map((row) => ({ ...row })) }
  }
  private publish() {
    this.changed(this.snapshot)
  }
  private cancel() {
    this.epoch++
    for (const job of this.jobs) job.abort()
    this.jobs.clear()
    this.value.rows = this.value.rows.map((row) => ({
      ...row,
      state: row.state === "working" ? "waiting" : row.state,
    }))
  }
  update(text: string) {
    if (this.disposed || text.length > MAX_TRANSCRIPT || text === this.full) return
    const append = text.startsWith(this.full)
    if (!append) this.cancel()
    this.full = text
    const inputs = recentLiveRows(text)
    const old = new Map(this.value.rows.map((row) => [row.id, row]))
    const previous = new Map(this.inputs.map((row) => [row.id, row]))
    this.inputs = inputs
    this.value.rows = inputs.map((row) => {
      const before = previous.get(row.id),
        saved = old.get(row.id)
      return saved && before?.source === row.source && before.context === row.context
        ? saved
        : { id: row.id, source: row.source, translation: "", state: "waiting" }
    })
    this.publish()
    this.pump()
  }
  configure(enabled: boolean, target: LiveTranslation["target"], retry = false) {
    if (this.disposed) return
    if (enabled === this.value.enabled && target === this.value.target && !retry) return
    this.cancel()
    if (target !== this.value.target)
      this.value.rows = this.value.rows.map((row) => ({
        ...row,
        translation: "",
        state: "waiting",
      }))
    this.value = { ...this.value, enabled, target, failed: false, message: "" }
    this.publish()
    this.pump()
  }
  invalidate() {
    this.cancel()
    this.value = {
      ...this.value,
      enabled: false,
      failed: false,
      rows: this.value.rows.map((row) => ({ ...row, translation: "", state: "waiting" })),
      message: "Cấu hình đã đổi. Bật Dịch lại để dùng cấu hình mới.",
    }
    this.publish()
  }
  dispose() {
    this.disposed = true
    this.cancel()
    this.inputs = []
    this.full = ""
    this.value.rows = []
  }
  private pump() {
    if (this.disposed || !this.value.enabled || this.value.failed) return
    while (this.jobs.size < 2) {
      // Newest waiting turns first when a slow provider has accumulated a backlog.
      const waiting = this.value.rows.filter((row) => row.state === "waiting")
      if (!waiting.length) return
      const rows: LiveRow[] = []
      let size = 0
      for (const row of waiting.slice().reverse()) {
        if (rows.length === 4 || size + row.source.length > 6000) break
        rows.unshift(row)
        size += row.source.length
      }
      const inputs = rows.map((row) => this.inputs.find((input) => input.id === row.id)!)
      const epoch = this.epoch,
        target = this.value.target,
        job = new AbortController()
      this.jobs.add(job)
      for (const row of rows) row.state = "working"
      this.publish()
      void this.run(rows, inputs, target, job, epoch)
    }
  }
  private async run(
    rows: LiveRow[],
    inputs: TranslationInput[],
    target: LiveTranslation["target"],
    job: AbortController,
    epoch: number,
  ) {
    try {
      const results = await this.translate(inputs, target, job.signal)
      job.signal.throwIfAborted()
      if (epoch !== this.epoch || this.disposed) return
      if (
        results.length !== rows.length ||
        results.some((text) => typeof text !== "string" || !text.trim() || text.length > 6000)
      )
        throw new Error("Invalid live translation")
      rows.forEach((row, i) => {
        if (this.value.rows.includes(row)) {
          row.translation = results[i]!
          row.state = "done"
        }
      })
    } catch {
      if (epoch !== this.epoch || this.disposed) return
      this.cancel()
      this.value.failed = true
      this.value.message =
        "Chưa dịch được. Kiểm tra model/key/hạn mức rồi bấm Thử dịch lại. Chép lời vẫn tiếp tục."
    } finally {
      this.jobs.delete(job)
      if (epoch === this.epoch || this.value.failed) this.publish()
      if (epoch === this.epoch) this.pump()
    }
  }
}
