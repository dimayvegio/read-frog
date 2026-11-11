import { SpeechEndDetector } from "@/utils/reading-library/silence"

/** Local audio-clock gate. No timer based on UI visibility, text or network replies. */
export class LiveTurnGate {
  private detector = new SpeechEndDetector(500)
  private voiced = 0
  constructor(private started: number) {}
  push(rms: number, now: number): "commit" | "clear" | null {
    if (!Number.isFinite(rms) || !Number.isFinite(now) || rms < 0 || now < this.started) return null
    if (rms >= 0.008) this.voiced++
    if (!this.detector.push(rms, now) && now - this.started < 6000) return null
    const action = this.voiced >= 2 ? "commit" : "clear"
    this.detector = new SpeechEndDetector(500)
    this.started = now
    this.voiced = 0
    return action
  }
}
