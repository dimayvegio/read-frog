/** Relative volume automation; never changes the player's mute state. */
export class VolumeDucker {
  private baseline: number
  private written: number
  private gain = 1
  private target = 1
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
    if (Math.abs(this.target - this.gain) < 0.001) {
      clearInterval(this.timer)
      this.timer = undefined
      return
    }
    this.gain += (this.target - this.gain) * 0.3
    if (Math.abs(this.target - this.gain) < 0.001) this.gain = this.target
    this.written = Math.max(0, Math.min(1, this.baseline * this.gain))
    this.video.volume = this.written
  }
  speaking(value: boolean) {
    this.target = value ? this.ratio : 1
    if (!this.timer && Math.abs(this.target - this.gain) >= 0.001)
      this.timer = setInterval(() => this.step(), 20)
  }
  destroy() {
    clearInterval(this.timer)
    this.video.removeEventListener("volumechange", this.changed)
    this.video.volume = this.baseline
  }
}
