import type { ReadingStep } from "./audio"

export class ReadingPlayer {
  private controller: AbortController | null = null
  private audio: HTMLAudioElement | null = null
  private paused = false
  constructor(
    private readonly onStep: (step: ReadingStep | null) => void,
    private readonly onState: (state: "idle" | "playing" | "paused") => void,
  ) {}
  pause() {
    if (!this.controller) return
    this.paused = true
    this.audio?.pause()
    this.onState("paused")
  }
  resume() {
    if (!this.controller) return
    this.paused = false
    if (this.audio)
      void this.audio.play().catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) this.stop()
      })
    this.onState("playing")
  }
  stop() {
    this.controller?.abort()
    this.controller = null
    this.paused = false
    this.onStep(null)
    this.onState("idle")
  }
  async play(steps: ReadingStep[]) {
    this.stop()
    const controller = new AbortController(),
      { signal } = controller
    this.controller = controller
    this.onState("playing")
    try {
      for (const step of steps) {
        signal.throwIfAborted()
        this.onStep(step)
        if (step.side === "gap") await this.delay((step.seconds ?? 0) * 1000, signal)
        else {
          await this.delay(0, signal)
          const asset = step.asset!
          const url = URL.createObjectURL(
              new Blob([Uint8Array.from(asset.bytes).buffer], { type: asset.type }),
            ),
            audio = new Audio(url)
          this.audio = audio
          try {
            await new Promise<void>((resolve, reject) => {
              const abort = () => reject(new DOMException("Stopped", "AbortError"))
              signal.addEventListener("abort", abort, { once: true })
              audio.onended = () => {
                signal.removeEventListener("abort", abort)
                resolve()
              }
              audio.onerror = () => {
                signal.removeEventListener("abort", abort)
                reject(new Error("Không phát được audio."))
              }
              void audio.play().catch((error) => {
                // pause() can interrupt a pending play() before metadata loads.
                // Keep this clip alive so resume() continues the same sequence.
                if (!signal.aborted && error instanceof DOMException && error.name === "AbortError")
                  return
                signal.removeEventListener("abort", abort)
                reject(error)
              })
            })
          } finally {
            audio.onended = null
            audio.onerror = null
            audio.pause()
            audio.removeAttribute("src")
            audio.load()
            URL.revokeObjectURL(url)
            if (this.audio === audio) this.audio = null
          }
        }
      }
    } catch (error) {
      if (!signal.aborted) throw error
    } finally {
      if (this.controller === controller) {
        this.controller = null
        this.onStep(null)
        this.onState("idle")
      }
    }
  }
  private delay(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      let remaining = ms,
        last = performance.now()
      const abort = () => {
        clearInterval(timer)
        signal.removeEventListener("abort", abort)
        reject(new DOMException("Stopped", "AbortError"))
      }
      const timer = setInterval(() => {
        const now = performance.now()
        if (!this.paused) remaining -= now - last
        last = now
        if (!this.paused && remaining <= 0) {
          clearInterval(timer)
          signal.removeEventListener("abort", abort)
          resolve()
        }
      }, 25)
      signal.addEventListener("abort", abort, { once: true })
      if (signal.aborted) abort()
    })
  }
}
