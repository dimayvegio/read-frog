import { readingAssetId, validateReadingAsset } from "./db"
import { MAX_READING_ASSET, type ReadingAsset } from "./schema"
import { monitorRecordingSilence } from "./silence"

interface RecordingOptions {
  stopOnSilence?: boolean
  onSilenceStop?: () => void
  onSilenceUnavailable?: () => void
}

/** Microphone access is only requested by start(). Pending permissions are fenced by a generation. */
export class ShadowRecorder {
  private generation = 0
  private recorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private discard = false
  private stopSilenceMonitor: (() => void) | null = null
  constructor(
    private readonly onState: (state: "idle" | "requesting" | "recording") => void,
    private readonly maxDurationMs = 60000,
  ) {}
  stop(discard = false) {
    this.stopSilenceMonitor?.()
    this.stopSilenceMonitor = null
    this.discard = discard
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop()
    else {
      this.generation++
      this.onState("idle")
    }
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
  async start(options: RecordingOptions = {}): Promise<ReadingAsset | null> {
    this.stop(true)
    const generation = ++this.generation
    this.discard = false
    this.onState("requesting")
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    } catch {
      if (generation === this.generation) this.onState("idle")
      throw new Error("Không mở được micro. Cho phép micro trong Edge và kiểm tra thiết bị.")
    }
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop())
      return null
    }
    this.stream = stream
    try {
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(
        (type) => MediaRecorder.isTypeSupported(type),
      )
      if (!mimeType) throw new Error("Trình duyệt chưa hỗ trợ ghi âm.")
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 })
      this.recorder = recorder
      const parts: Blob[] = []
      let size = 0,
        tooLarge = false
      return await new Promise<ReadingAsset | null>((resolve, reject) => {
        const cleanup = () => {
          stream.getTracks().forEach((track) => track.stop())
          if (this.recorder === recorder) {
            this.stopSilenceMonitor?.()
            this.stopSilenceMonitor = null
            this.recorder = null
            this.stream = null
            if (this.timer) clearTimeout(this.timer)
            this.timer = null
            this.onState("idle")
          }
          recorder.ondataavailable = null
          recorder.onerror = null
          recorder.onstop = null
        }
        recorder.ondataavailable = (event) => {
          size += event.data.size
          if (size > MAX_READING_ASSET) {
            tooLarge = true
            this.stop(true)
          } else parts.push(event.data)
        }
        recorder.onerror = () => {
          cleanup()
          reject(new Error("Ghi âm thất bại. Hãy thử lại."))
        }
        recorder.onstop = () => {
          const discard = this.discard || generation !== this.generation
          cleanup()
          if (tooLarge) {
            reject(new Error("Bản thu vượt 8 MiB."))
            return
          }
          if (discard) {
            resolve(null)
            return
          }
          void new Blob(parts, { type: mimeType })
            .arrayBuffer()
            .then((buffer) => {
              const bytes = new Uint8Array(buffer)
              resolve(
                validateReadingAsset({
                  id: readingAssetId(bytes),
                  type: mimeType.split(";")[0] as ReadingAsset["type"],
                  bytes,
                }),
              )
            })
            .catch(reject)
        }
        recorder.start(500)
        this.onState("recording")
        this.timer = setTimeout(() => this.stop(), this.maxDurationMs)
        if (options.stopOnSilence)
          this.stopSilenceMonitor = monitorRecordingSilence(
            stream,
            () => {
              if (
                generation !== this.generation ||
                this.recorder !== recorder ||
                recorder.state !== "recording"
              )
                return
              this.stop()
              options.onSilenceStop?.()
            },
            () => {
              if (
                generation === this.generation &&
                this.recorder === recorder &&
                recorder.state === "recording"
              )
                options.onSilenceUnavailable?.()
            },
          )
      })
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop())
      if (generation === this.generation) {
        this.stopSilenceMonitor?.()
        this.stopSilenceMonitor = null
        this.recorder = null
        this.stream = null
        this.onState("idle")
      }
      throw error
    }
  }
}
