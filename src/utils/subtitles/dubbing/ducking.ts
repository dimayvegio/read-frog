/** Relative volume automation; never changes the player's mute state. */
export class VolumeDucker {
  private baseline: number
  private written: number
  private gain = 1
  private target = 1
  private speakingNow = false
  private from = 1
  private startedAt = 0
  private duration = 100
  private timer: ReturnType<typeof setInterval> | undefined
  constructor(
    private video: HTMLVideoElement,
    private ratio: number,
  ) {
    this.baseline = video.volume
    this.written = video.volume
    video.addEventListener("volumechange", this.changed)
  }
  private changed = () => {
    if (Math.abs(this.video.volume - this.written) > 0.0001) {
      this.baseline = Math.min(
        1,
        this.gain > 0.01 ? this.video.volume / this.gain : this.video.volume,
      )
      this.written = this.video.volume
    }
  }
  private step() {
    const t = Math.min(1, Math.max(0, (performance.now() - this.startedAt) / this.duration))
    const eased = t * t * (3 - 2 * t)
    this.gain = this.from + (this.target - this.from) * eased
    this.written = Math.max(0, Math.min(1, this.baseline * this.gain))
    this.video.volume = this.written
    if (t === 1) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }
  speaking(value: boolean) {
    this.speakingNow = value
    const next = value ? this.ratio : 1
    if (next === this.target) return
    this.target = next
    this.from = this.gain
    this.startedAt = performance.now()
    this.duration = value ? 100 : 600
    clearInterval(this.timer)
    this.timer = setInterval(() => this.step(), 20)
  }
  setRatio(value: number) {
    if (!Number.isFinite(value)) return
    const active = this.speakingNow
    this.ratio = Math.max(0, Math.min(1, value))
    if (active) this.speaking(true)
  }
  destroy() {
    clearInterval(this.timer)
    this.video.removeEventListener("volumechange", this.changed)
    this.video.volume = this.baseline
  }
}
