import type { TTSAudioChunk } from "@/types/openai-tts"
import { wavDurationMs } from "@/utils/usage/audio"
export const MAX_DUBBING_AUDIO_BYTES = 8 * 1024 * 1024
export interface DubbingAudio {
  bytes: Uint8Array
  duration: number
}
export interface VoicePlayer {
  unlock: () => Promise<void>
  play: (
    audio: DubbingAudio,
    offset: number,
    rate: number,
    ended: (error?: boolean) => void,
  ) => Promise<void>
  pause: () => void
  resume: () => Promise<void>
  position: () => number
  setRate: (rate: number) => void
  stop: () => void
  destroy: () => void
}
export function decodeDubbingAudio(chunk: TTSAudioChunk): DubbingAudio {
  if (chunk.contentType !== "audio/wav" || chunk.audioBase64.length > 12 * 1024 * 1024)
    throw new Error("Invalid dubbing audio")
  const bytes = Uint8Array.from(atob(chunk.audioBase64), (c) => c.charCodeAt(0)),
    duration = wavDurationMs(bytes)
  if (bytes.byteLength > MAX_DUBBING_AUDIO_BYTES || !duration || duration > 60000)
    throw new Error("Dubbing audio duration exceeds limit")
  return { bytes, duration: duration / 1000 }
}
/** Content owns playback only; synthesis remains in the private background runtime. */
export class HtmlVoicePlayer implements VoicePlayer {
  private audio = new Audio()
  private url: string | null = null
  private epoch = 0
  constructor() {
    this.audio.preservesPitch = true
    this.audio.preload = "auto"
  }
  async unlock() {
    // Resume the media permission in the Start click, before provider awaits.
    const bytes = new Uint8Array(46),
      view = new DataView(bytes.buffer)
    for (const [at, tag] of [
      [0, "RIFF"],
      [8, "WAVE"],
      [12, "fmt "],
      [36, "data"],
    ] as const)
      for (let i = 0; i < tag.length; i++) bytes[at + i] = tag.charCodeAt(i)
    view.setUint32(4, 38, true)
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, 24000, true)
    view.setUint32(28, 48000, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    view.setUint32(40, 2, true)
    this.stop()
    this.url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }))
    this.audio.src = this.url
    await this.audio.play()
  }
  async play(audio: DubbingAudio, offset: number, rate: number, ended: (error?: boolean) => void) {
    this.stop()
    const epoch = this.epoch
    this.url = URL.createObjectURL(
      new Blob([Uint8Array.from(audio.bytes).buffer], { type: "audio/wav" }),
    )
    this.audio.src = this.url
    this.audio.currentTime = Math.max(0, Math.min(audio.duration - 0.01, offset))
    this.audio.playbackRate = rate
    this.audio.onended = () => {
      if (epoch === this.epoch) ended()
    }
    this.audio.onerror = () => {
      if (epoch === this.epoch) ended(true)
    }
    await this.audio.play()
    // A stale play promise must never pause its replacement.
  }
  pause() {
    this.audio.pause()
  }
  resume() {
    return this.audio.play()
  }
  position() {
    return this.audio.currentTime
  }
  setRate(rate: number) {
    this.audio.playbackRate = rate
  }
  stop() {
    this.epoch++
    this.audio.pause()
    this.audio.onended = null
    this.audio.onerror = null
    this.audio.removeAttribute("src")
    this.audio.load()
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = null
  }
  destroy() {
    this.stop()
  }
}
