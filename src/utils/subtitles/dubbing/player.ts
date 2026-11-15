import type { TTSAudioChunk } from "@/types/openai-tts"
import { wavDurationMs } from "@/utils/usage/audio"
export const MAX_DUBBING_AUDIO_BYTES = 8 * 1024 * 1024
export interface DubbingAudio {
  bytes: Uint8Array
  duration: number
  peak?: number
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
  setVolume: (volume: number) => void
  seek: (seconds: number) => void
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
  return { bytes, duration: duration / 1000, peak: dubbingPeak(bytes) }
}
/** Peak guard for bounded integer PCM WAV. Unknown encodings never get boosted. */
export function dubbingPeak(bytes: Uint8Array): number {
  if (bytes.length < 44) return 1
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let bits = 0,
    peak = 0,
    found = false
  for (let at = 12; at + 8 <= bytes.length;) {
    const tag = String.fromCharCode(...bytes.subarray(at, at + 4)),
      size = view.getUint32(at + 4, true),
      end = at + 8 + size
    if (end > bytes.length) return 1
    if (tag === "fmt " && size >= 16) {
      if (view.getUint16(at + 8, true) !== 1) return 1
      bits = view.getUint16(at + 22, true)
    }
    if (tag === "data") {
      if (![8, 16, 24, 32].includes(bits)) return 1
      const step = bits / 8
      for (let i = at + 8; i + step <= end; i += step) {
        let sample: number
        if (bits === 8) sample = (view.getUint8(i) - 128) / 128
        else if (bits === 16) sample = view.getInt16(i, true) / 32768
        else if (bits === 32) sample = view.getInt32(i, true) / 2147483648
        else {
          let n = bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16)
          if (n & 0x800000) n -= 0x1000000
          sample = n / 8388608
        }
        peak = Math.max(peak, Math.abs(sample))
        found = true
      }
    }
    at = end + (size & 1)
  }
  return found ? peak : 1
}
/** Content owns playback only; synthesis remains in the private background runtime. */
export class HtmlVoicePlayer implements VoicePlayer {
  private audio = new Audio()
  private url: string | null = null
  private epoch = 0
  private context: AudioContext | null = null
  private gain: GainNode | null = null
  private input: MediaElementAudioSourceNode | null = null
  private volume = 1
  private peak = 1
  private duration = 0
  constructor() {
    this.audio.preservesPitch = true
    this.audio.preload = "auto"
  }
  async unlock() {
    // Unlock both the media element and local gain graph in the explicit Start click.
    this.context = new AudioContext()
    this.input = this.context.createMediaElementSource(this.audio)
    this.gain = this.context.createGain()
    this.input.connect(this.gain)
    this.gain.connect(this.context.destination)
    const resumed = this.context.resume()
    this.applyVolume()
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
    await Promise.all([resumed, this.audio.play()])
  }
  async play(audio: DubbingAudio, offset: number, rate: number, ended: (error?: boolean) => void) {
    this.stop()
    const epoch = this.epoch
    this.url = URL.createObjectURL(
      new Blob([Uint8Array.from(audio.bytes).buffer], { type: "audio/wav" }),
    )
    this.audio.src = this.url
    this.duration = audio.duration
    this.peak = audio.peak ?? dubbingPeak(audio.bytes)
    this.applyVolume(true)
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
  private applyVolume(immediate = false) {
    if (!this.gain || !this.context) return
    const safe = Math.min(this.volume, this.peak > 0 ? 0.98 / this.peak : 1.5)
    this.gain.gain.cancelScheduledValues(this.context.currentTime)
    if (immediate) this.gain.gain.setValueAtTime(safe, this.context.currentTime)
    else this.gain.gain.setTargetAtTime(safe, this.context.currentTime, 0.015)
  }
  setVolume(value: number) {
    if (!Number.isFinite(value)) return
    this.volume = Math.max(0, Math.min(1.5, value))
    this.applyVolume()
  }
  seek(seconds: number) {
    if (Number.isFinite(seconds) && this.duration > 0)
      this.audio.currentTime = Math.max(0, Math.min(this.duration - 0.01, seconds))
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
    this.input?.disconnect()
    this.gain?.disconnect()
    if (this.context) void this.context.close().catch(() => {})
    this.input = null
    this.gain = null
    this.context = null
  }
}
