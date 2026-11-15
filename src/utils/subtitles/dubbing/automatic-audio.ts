import type { PreparedAudio } from "./prepare-audio"
import { AUTO_SAMPLE_SECONDS } from "./automatic"
import { MonoPcmConverter } from "./pcm"
export interface AutomaticAudio extends PreparedAudio {
  start: number
  end: number
  rate: number
}
/** Passive sample of the watched player. No seek/pause/volume/rate/microphone mutation. */
export async function sampleVideoAudio(
  video: HTMLVideoElement,
  signal: AbortSignal,
  valid: () => boolean,
  progress: (text: string) => void,
): Promise<AutomaticAudio> {
  signal.throwIfAborted()
  const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream
  if (!capture) throw new Error("Player không cho lấy audio. Có thể dùng chế độ Chuẩn bị trước.")
  const context = new AudioContext({ sampleRate: 16000 })
  let stream: MediaStream | undefined,
    source: MediaStreamAudioSourceNode | undefined,
    processor: ScriptProcessorNode | undefined,
    gain: GainNode | undefined
  const routeRate = video.playbackRate,
    converter = new MonoPcmConverter()
  let start: number
  try {
    const { Mp3Encoder } = await import("@breezystack/lamejs")
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: unknown) => {
        clearTimeout(timer)
        signal.removeEventListener("abort", abort)
        if (error) reject(error)
        else resolve()
      }
      const abort = () => finish(new DOMException("Đã hủy", "AbortError"))
      const timer = setTimeout(
        () => finish(new Error("Chưa mở được audio; bấm bắt đầu lại khi sẵn sàng.")),
        10000,
      )
      signal.addEventListener("abort", abort, { once: true })
      void context.resume().then(() => finish(), finish)
      if (signal.aborted) abort()
    })
    signal.throwIfAborted()
    if (!valid() || video.paused || routeRate !== video.playbackRate)
      throw new DOMException("Video chưa sẵn sàng", "AbortError")
    start = video.currentTime * 1000
    stream = capture.call(video)
    for (const t of stream.getVideoTracks()) t.stop()
    if (!stream.getAudioTracks().length)
      throw new Error("Player không cung cấp audio để tự phân tích.")
    source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
    processor = context.createScriptProcessor(4096, 2, 1)
    gain = context.createGain()
    gain.gain.value = 0
    source.connect(processor)
    processor.connect(gain)
    gain.connect(context.destination)
    const encoder = new Mp3Encoder(1, 16000, 32),
      parts: Uint8Array[] = []
    let frames = 0,
      size = 0
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      let closed = false,
        waiting = false
      const clean = () => {
        clearInterval(timer)
        signal.removeEventListener("abort", abort)
        for (const n of ["seeking", "ratechange"]) video.removeEventListener(n, changed)
        video.removeEventListener("ended", done)
        video.removeEventListener("waiting", wait)
        video.removeEventListener("playing", play)
        if (processor) processor.onaudioprocess = null
      }
      const fail = (e: Error) => {
        if (closed) return
        closed = true
        clean()
        reject(e)
      }
      const abort = () => fail(new DOMException("Đã hủy phân tích", "AbortError"))
      const changed = () => fail(new DOMException("Vị trí hoặc tốc độ đã đổi", "AbortError"))
      const wait = () => {
          waiting = true
        },
        play = () => {
          waiting = false
        }
      const done = () => {
        if (closed) return
        closed = true
        clean()
        try {
          if (frames < 16000 * 2 || converter.peak < 0.0001)
            throw new Error("Chưa có đủ tiếng để phân tích.")
          const tail = Uint8Array.from(encoder.flush())
          parts.push(tail)
          size += tail.length
          const result = new Uint8Array(size)
          let at = 0
          for (const p of parts) {
            result.set(p, at)
            at += p.length
          }
          resolve(result)
        } catch {
          reject(new Error("Chưa lấy được audio rõ. Không tự gửi lại tính phí."))
        }
      }
      processor!.onaudioprocess = (e) => {
        if (closed || video.paused || waiting) return
        if (!valid()) {
          abort()
          return
        }
        try {
          const length = Math.min(e.inputBuffer.length, AUTO_SAMPLE_SECONDS * 16000 - frames)
          const input = {
            length,
            numberOfChannels: e.inputBuffer.numberOfChannels,
            getChannelData: (c: number) => e.inputBuffer.getChannelData(c).subarray(0, length),
          }
          const p = Uint8Array.from(encoder.encodeBuffer(converter.convert(input)))
          parts.push(p)
          size += p.length
          frames += length
          if (size > 256 * 1024) {
            fail(new Error("Audio sample vượt giới hạn."))
            return
          }
          if (frames >= AUTO_SAMPLE_SECONDS * 16000) done()
        } catch {
          fail(new Error("Không xử lý được audio từ player."))
        }
      }
      const began = performance.now(),
        timer = setInterval(() => {
          if (!valid()) abort()
          else if (performance.now() - began > 600000)
            fail(new Error("Đã dừng mẫu audio chờ quá lâu."))
          else
            progress(
              video.paused
                ? "AI tạm chờ video phát tiếp."
                : `AI đang nghe ${Math.floor(frames / 16000)}/${AUTO_SAMPLE_SECONDS} giây; bạn tiếp tục xem bình thường.`,
            )
        }, 500)
      signal.addEventListener("abort", abort, { once: true })
      for (const n of ["seeking", "ratechange"]) video.addEventListener(n, changed)
      video.addEventListener("ended", done, { once: true })
      video.addEventListener("waiting", wait)
      video.addEventListener("playing", play)
      if (signal.aborted) abort()
    })
    signal.throwIfAborted()
    let binary = ""
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    return {
      audio: btoa(binary),
      format: "mp3",
      duration: frames / 16000,
      start,
      end: video.currentTime * 1000,
      rate: routeRate,
    }
  } finally {
    if (processor) processor.onaudioprocess = null
    processor?.disconnect()
    source?.disconnect()
    gain?.disconnect()
    stream?.getTracks().forEach((t) => t.stop())
    await context.close().catch(() => {})
  }
}
