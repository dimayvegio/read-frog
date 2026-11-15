import type { DubbingCue } from "./cues"
import type { DubbingAudio, VoicePlayer } from "./player"
import { dubbingWindow } from "./cues"
import { VolumeDucker } from "./ducking"
import { MAX_DUBBING_AUDIO_BYTES } from "./player"
export interface DubbingState {
  active: boolean
  message: string
}
export interface DubbingDependencies {
  video: HTMLVideoElement
  player: VoicePlayer
  cues: () => DubbingCue[]
  valid: () => boolean
  generate: (text: string, signal: AbortSignal) => Promise<DubbingAudio>
  state: (state: DubbingState) => void
  duck: number
}
/** One source-owned session. No global speaker, disk audio, retries or translation queue. */
export class DubbingController {
  private stopped = false
  private ending = false
  private epoch = 0
  private cache = new Map<string, DubbingAudio>()
  private pending = new Map<string, AbortController>()
  private played = new Set<string>()
  private current: { cue: DubbingCue; audio: DubbingAudio; started: boolean } | null = null
  private hold: "buffer" | "tail" | null = null
  private timer: ReturnType<typeof setInterval>
  private ducker: VolumeDucker
  private message = ""
  constructor(private d: DubbingDependencies) {
    this.ducker = new VolumeDucker(d.video, d.duck)
    for (const name of ["play", "pause", "waiting", "playing", "ratechange"] as const)
      d.video.addEventListener(name, this.onMedia)
    d.video.addEventListener("seeking", this.onSeek)
    d.video.addEventListener("ended", this.onEnded)
    this.timer = setInterval(() => this.tick(), 100)
    this.tick()
  }
  private report(message: string) {
    if (this.message === message) return
    this.message = message
    this.d.state({ active: !this.stopped, message })
  }
  private onEnded = () => {
    this.ending = true
    if (this.current?.started) {
      this.hold = "tail"
      return
    }
    this.stop("Video đã kết thúc.")
  }
  private onMedia = (event: Event) => {
    if (event.type === "play") {
      this.ending = false
      if (this.hold === "tail") {
        this.d.player.stop()
        this.current = null
        this.ducker.speaking(false)
      }
      this.hold = null
    }
    if (event.type === "waiting") {
      this.d.player.pause()
      this.ducker.speaking(false)
      return
    }
    if (this.d.video.paused && this.hold !== "tail") {
      this.d.player.pause()
      this.ducker.speaking(false)
    } else if (this.current?.started) {
      const current = this.current,
        epoch = this.epoch
      void this.d.player.resume().catch(() => {
        if (!this.stopped && this.current === current && this.epoch === epoch)
          this.stop("Bấm Bắt đầu để cho phép phát giọng đọc.")
      })
    }
    this.tick()
  }
  private onSeek = () => {
    this.ending = false
    this.epoch++
    this.cancelPending()
    this.d.player.stop()
    this.ducker.speaking(false)
    this.current = null
    this.played.clear()
    // A seek expresses user intent: never resume a pause owned by the old position.
    this.hold = null
  }
  private cancelPending() {
    for (const c of this.pending.values()) c.abort()
    this.pending.clear()
  }
  private pauseFor(reason: "buffer" | "tail") {
    if (!this.d.video.paused) {
      this.hold = reason
      this.d.video.pause()
    }
  }
  private release() {
    if (!this.hold) return
    this.hold = null
    const epoch = this.epoch
    if (!this.stopped && this.d.valid())
      void this.d.video.play().catch(() => {
        if (!this.stopped && epoch === this.epoch)
          this.stop("Video đang tạm dừng. Bấm phát rồi Bắt đầu lại.")
      })
  }
  private pump(window: DubbingCue[]) {
    const allowed = new Set(window.map((c) => c.id))
    for (const id of this.cache.keys()) if (!allowed.has(id)) this.cache.delete(id)
    for (const [id, c] of this.pending)
      if (!allowed.has(id)) {
        c.abort()
        this.pending.delete(id)
      }
    for (const cue of window) {
      if (this.pending.size >= 2) break
      if (this.cache.has(cue.id) || this.pending.has(cue.id) || this.played.has(cue.id)) continue
      const reserved =
        Array.from(this.cache.values()).reduce((n, a) => n + a.bytes.byteLength, 0) +
        this.pending.size * MAX_DUBBING_AUDIO_BYTES
      // Reserve worst-case room before paying for another cue: never evict and regenerate
      // the same future speech in a loop when several long WAVs fill the cache.
      if (reserved + MAX_DUBBING_AUDIO_BYTES > 16 * 1024 * 1024) break
      const abort = new AbortController(),
        epoch = this.epoch
      this.pending.set(cue.id, abort)
      void this.d
        .generate(cue.text, abort.signal)
        .then((audio) => {
          if (this.stopped || abort.signal.aborted || epoch !== this.epoch || !this.d.valid())
            return
          this.cache.set(cue.id, audio)
          // Completed audio is bounded to six cues / 16 MiB, independent of other TTS caches.
          let size = Array.from(this.cache.values()).reduce((n, a) => n + a.bytes.byteLength, 0)
          for (const [id, a] of this.cache) {
            if (this.cache.size <= 6 && size <= 16 * 1024 * 1024) break
            this.cache.delete(id)
            size -= a.bytes.byteLength
          }
        })
        .catch(() => {
          if (!this.stopped && !abort.signal.aborted && epoch === this.epoch)
            this.stop(
              "Chưa tạo được giọng đọc OpenAI. Kiểm tra cấu hình rồi bấm Bắt đầu lại; không tự thử tính phí.",
            )
        })
        .finally(() => {
          if (this.pending.get(cue.id) === abort) this.pending.delete(cue.id)
          if (!this.stopped) this.tick()
        })
    }
  }
  tick = () => {
    try {
      this.update()
    } catch {
      this.stop("Track phụ đề không hợp lệ. Bấm Bắt đầu lại sau khi đổi CC.")
    }
  }
  private update() {
    if (this.stopped) return
    if (!this.d.valid()) {
      this.stop("Nguồn video hoặc cấu hình đã đổi. Bấm Bắt đầu lại.")
      return
    }
    const v = this.d.video
    if (v.seeking) return
    const time = v.currentTime * 1000,
      window = dubbingWindow(this.d.cues(), time)
    // Manual pause does not consume the rest of a video in the background.
    if (!this.ending) this.pump(v.paused && !this.hold ? window.slice(0, 1) : window)
    if (this.current) {
      const { cue, audio } = this.current
      if (!this.d.cues().some((c) => c.id === cue.id)) {
        this.stop("Phụ đề đã đổi. Bấm Bắt đầu lại.")
        return
      }
      const left = Math.max(0.1, (cue.end - time) / 1000),
        remaining = Math.max(0, audio.duration - this.d.player.position())
      this.d.player.setRate(
        Math.max(0.5, Math.min(1.75, Math.max(v.playbackRate, remaining / left))),
      )
      if (time >= cue.end) this.pauseFor("tail")
      if (v.paused && this.hold !== "tail") {
        this.d.player.pause()
        this.ducker.speaking(false)
        this.report("Tạm dừng cùng video.")
      } else if (this.current.started) {
        this.ducker.speaking(true)
        this.report("Đang lồng tiếng · Giọng AI OpenAI")
      }
      return
    }
    const cue = window.find((c) => c.start <= time + 80 && c.end > time && !this.played.has(c.id))
    if (!cue) {
      this.release()
      this.ducker.speaking(false)
      this.report("Đang chờ câu phụ đề tiếp theo.")
      return
    }
    const audio = this.cache.get(cue.id)
    if (!audio) {
      this.pauseFor("buffer")
      this.report("Đang đệm giọng đọc OpenAI…")
      return
    }
    if (v.paused && !this.hold) {
      this.report("Sẵn sàng. Bấm phát video để nghe.")
      return
    }
    const current = { cue, audio, started: false },
      epoch = this.epoch
    this.current = current
    this.release()
    this.played.add(cue.id)
    if (this.played.size > 100) this.played.delete(this.played.values().next().value!)
    const offset =
      Math.max(0, Math.min(0.9, (time - cue.start) / (cue.end - cue.start))) * audio.duration
    const rate = Math.max(
      0.5,
      Math.min(
        1.75,
        Math.max(
          v.playbackRate,
          (audio.duration - offset) / Math.max(0.1, (cue.end - time) / 1000),
        ),
      ),
    )
    void this.d.player
      .play(audio, offset, rate, (error) => {
        if (this.stopped || this.current !== current || epoch !== this.epoch) return
        if (this.ending) {
          this.stop("Video đã kết thúc.")
          return
        }
        if (error) {
          this.stop("Không phát được âm thanh. Bấm Bắt đầu lại.")
          return
        }
        this.current = null
        this.ducker.speaking(false)
        this.release()
        this.tick()
      })
      .then(() => {
        if (this.stopped || this.current !== current || epoch !== this.epoch) return
        current.started = true
        if (v.paused && this.hold !== "tail") this.d.player.pause()
        else this.ducker.speaking(true)
      })
      .catch(() => {
        if (!this.stopped && this.current === current)
          this.stop("Bấm Bắt đầu để cho phép phát giọng đọc.")
      })
  }
  stop(message = "Đã tắt lồng tiếng.", resume = false) {
    if (this.stopped) return
    const shouldResume = resume && this.hold !== null && this.d.valid()
    this.hold = null
    this.stopped = true
    this.epoch++
    clearInterval(this.timer)
    this.cancelPending()
    this.d.player.destroy()
    this.ducker.destroy()
    this.current = null
    this.cache.clear()
    this.played.clear()
    for (const name of ["play", "pause", "waiting", "playing", "ratechange"] as const)
      this.d.video.removeEventListener(name, this.onMedia)
    this.d.video.removeEventListener("seeking", this.onSeek)
    this.d.video.removeEventListener("ended", this.onEnded)
    this.report(message)
    if (shouldResume) void this.d.video.play().catch(() => {})
  }
}
