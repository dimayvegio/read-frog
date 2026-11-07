export interface StudyCue {
  start: number
  end: number
}
export interface StudyMedia {
  currentTime: number
  paused: boolean
  pause: () => void
  play: () => Promise<void>
}
/** Time in cues is milliseconds. Playback commands are explicit, opt-in only. */
export class SentenceStudyPlayer {
  index = -1
  private repeats = 1
  private pausedAfter = false
  private passes = 0
  private stoppedAt = -1
  private ownedSeek = false
  constructor(
    private media: StudyMedia,
    private cues: readonly StudyCue[],
    private changed: (index: number) => void,
  ) {
    this.cues = [...cues]
      .filter(
        (cue) => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start,
      )
      .sort((a, b) => a.start - b.start)
  }
  private activeAt(time: number) {
    let lo = 0,
      hi = this.cues.length - 1,
      index = -1
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      if (this.cues[mid]!.start <= time) {
        index = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    return index >= 0 && this.cues[index]!.end > time ? index : -1
  }
  seeking() {
    if (this.ownedSeek) return
    this.select(this.activeAt(this.media.currentTime * 1000))
    this.passes = 0
    this.stoppedAt = -1
  }
  seeked() {
    this.ownedSeek = false
  }
  preferences(repeats: number, pauseAfter: boolean) {
    this.repeats = Math.min(3, Math.max(1, repeats))
    this.pausedAfter = pauseAfter
  }
  private select(index: number) {
    if (index === this.index) return
    this.index = index
    this.passes = 0
    this.stoppedAt = -1
    this.changed(index)
  }
  tick() {
    const time = this.media.currentTime * 1000
    const cue = this.cues[this.index]
    if (
      cue &&
      time >= cue.end &&
      time < cue.end + 600 &&
      this.stoppedAt !== this.index &&
      !this.media.paused
    ) {
      this.passes++
      if (this.passes < this.repeats) {
        this.ownedSeek = true
        this.media.currentTime = cue.start / 1000
        return
      }
      this.stoppedAt = this.index
      if (this.pausedAfter) {
        this.ownedSeek = true
        this.media.currentTime = Math.max(cue.start, cue.end - 30) / 1000
        this.media.pause()
        return
      }
    }
    const index = this.activeAt(time)
    // Keep the last line selected through a gap, but follow manual seeks.
    if (index >= 0) this.select(index)
    else if (cue && (time < cue.start || time > cue.end + 600)) this.select(-1)
  }
  command(action: "previous" | "replay" | "next") {
    const time = this.media.currentTime * 1000
    const upcoming = this.cues.findIndex((cue) => cue.end > time)
    const nearest =
      this.index >= 0 ? this.index : upcoming >= 0 ? upcoming : Math.max(0, this.cues.length - 1)
    const index = Math.max(
      0,
      Math.min(
        this.cues.length - 1,
        nearest + (action === "previous" ? -1 : action === "next" ? 1 : 0),
      ),
    )
    const cue = this.cues[index]
    if (!cue) return
    this.select(index)
    this.passes = 0
    this.stoppedAt = -1
    this.ownedSeek = true
    this.media.currentTime = cue.start / 1000
    void this.media.play().catch(() => {})
  }
}
