import { MonoPcmConverter } from "./pcm"
import { SMART_AUDIO_LIMIT, SMART_AUDIO_SECONDS } from "./smart"
export interface PreparedAudio {
  audio: string
  format: "mp3" | "wav"
  duration: number
}
function base64(bytes: Uint8Array) {
  let text = ""
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(text)
}
export async function prepareAudioFile(file: File, signal: AbortSignal): Promise<PreparedAudio> {
  if (!file.size || file.size > SMART_AUDIO_LIMIT)
    throw new Error("Chọn audio MP3/WAV tối đa 8 MiB, cùng nội dung video.")
  const format = file.name.toLowerCase().endsWith(".wav")
    ? "wav"
    : file.name.toLowerCase().endsWith(".mp3")
      ? "mp3"
      : null
  if (!format) throw new Error("Chọn file MP3 hoặc WAV.")
  const audio = new Audio(),
    url = URL.createObjectURL(file)
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer)
        signal.removeEventListener("abort", abort)
        audio.onloadedmetadata = null
        audio.onerror = null
        if (error) reject(error)
        else resolve(audio.duration)
      }
      const abort = () => finish(new DOMException("Đã hủy", "AbortError")),
        timer = setTimeout(() => finish(new Error("Chưa đọc được audio.")), 10000)
      audio.onloadedmetadata = () => finish()
      audio.onerror = () => finish(new Error("Audio không đọc được."))
      signal.addEventListener("abort", abort, { once: true })
      audio.src = url
      if (signal.aborted) abort()
    })
    signal.throwIfAborted()
    if (!Number.isFinite(duration) || duration <= 0 || duration > SMART_AUDIO_SECONDS)
      throw new Error("Audio chuẩn bị tối đa 10 phút.")
    const bytes = new Uint8Array(await file.arrayBuffer())
    signal.throwIfAborted()
    return { audio: base64(bytes), format, duration }
  } finally {
    audio.pause()
    audio.removeAttribute("src")
    audio.load()
    URL.revokeObjectURL(url)
  }
}
/** Explicit local pre-recording, never microphone capture or a media download. */
export async function recordVideoAudio(
  video: HTMLVideoElement,
  signal: AbortSignal,
  valid: () => boolean,
  progress: (text: string) => void,
  canRestore: () => boolean = valid,
  range?: { start: number; seconds: number },
): Promise<PreparedAudio> {
  signal.throwIfAborted()
  if (
    !Number.isFinite(video.duration) ||
    video.duration <= 0 ||
    (!range && video.duration > SMART_AUDIO_SECONDS)
  )
    throw new Error("Thu trước hỗ trợ video tối đa 10 phút. Có thể chọn audio MP3/WAV tương ứng.")
  const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream
  if (!capture)
    throw new Error("Player không cho thu audio trực tiếp. Chọn file MP3/WAV cùng video.")
  if (
    range &&
    (!Number.isFinite(range.start) ||
      range.start < 0 ||
      !Number.isFinite(range.seconds) ||
      range.seconds < 15 ||
      range.seconds > SMART_AUDIO_SECONDS)
  )
    throw new Error("Khoảng phân tích không hợp lệ.")
  const start = range?.start ?? 0
  const duration = Math.min(video.duration - start, range?.seconds ?? video.duration)
  if (duration < 2) throw new Error("Hãy chọn vị trí còn ít nhất hai giây audio.")
  const context = new AudioContext({ sampleRate: 16000 }),
    resumed = context.resume()
  void resumed.catch(() => {})
  let initialTime = video.currentTime
  const initialRate = video.playbackRate,
    initialSrc = video.currentSrc
  let stream: MediaStream | null = null,
    source: MediaStreamAudioSourceNode | null = null,
    processor: ScriptProcessorNode | null = null,
    silent: GainNode | null = null,
    externalIntent = false,
    touched = false,
    settingUp = true
  let expectedTime = initialTime,
    expectedRate = initialRate
  const setupIntent = (event: Event) => {
    if (
      (event.type === "play" && !video.paused) ||
      (event.type === "seeking" && video.currentTime !== expectedTime) ||
      (event.type === "ratechange" && video.playbackRate !== expectedRate)
    )
      externalIntent = true
  }
  const removeSetupIntent = () => {
    for (const name of ["play", "seeking", "ratechange"])
      video.removeEventListener(name, setupIntent)
  }
  for (const name of ["play", "seeking", "ratechange"]) video.addEventListener(name, setupIntent)
  try {
    touched = true
    video.pause()
    initialTime = video.currentTime
    expectedTime = initialTime
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
        () => finish(new Error("Chưa mở được audio. Hãy bấm chuẩn bị lại hoặc chọn MP3/WAV.")),
        10000,
      )
      signal.addEventListener("abort", abort, { once: true })
      void resumed.then(() => finish(), finish)
      if (signal.aborted) abort()
    })
    signal.throwIfAborted()
    if (!valid()) throw new DOMException("Nguồn đã đổi", "AbortError")
    if (
      externalIntent ||
      video.currentTime !== initialTime ||
      video.playbackRate !== initialRate ||
      !video.paused
    ) {
      externalIntent = true
      throw new Error("Video đã được điều chỉnh. Bấm chuẩn bị lại.")
    }
    settingUp = false
    expectedRate = 1
    video.playbackRate = 1
    if (Math.abs(video.currentTime - start) > 0.02) {
      expectedTime = start
      video.currentTime = start
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            clean()
            reject(new Error("Không về được đầu video."))
          }, 10000),
          abort = () => {
            clean()
            reject(new DOMException("Đã hủy", "AbortError"))
          },
          done = () => {
            clean()
            resolve()
          },
          clean = () => {
            clearTimeout(timer)
            video.removeEventListener("seeked", done)
            signal.removeEventListener("abort", abort)
          }
        video.addEventListener("seeked", done, { once: true })
        signal.addEventListener("abort", abort, { once: true })
        if (signal.aborted) abort()
      })
    }
    if (
      externalIntent ||
      Math.abs(video.currentTime - start) > 0.05 ||
      video.playbackRate !== 1 ||
      !video.paused
    ) {
      externalIntent = true
      throw new Error("Video đã được điều chỉnh. Bấm chuẩn bị lại.")
    }
    removeSetupIntent()
    stream = capture.call(video)
    for (const track of stream.getVideoTracks()) track.stop()
    if (!stream.getAudioTracks().length)
      throw new Error("Không lấy được audio từ player. Chọn file MP3/WAV cùng video.")
    const encoder = new Mp3Encoder(1, 16000, 32),
      parts: Uint8Array[] = []
    let size = 0,
      recordedFrames = 0
    const maxFrames = range
      ? Math.ceil(duration * context.sampleRate)
      : Math.ceil(SMART_AUDIO_SECONDS * context.sampleRate) + 4096
    const converter = new MonoPcmConverter()
    source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
    processor = context.createScriptProcessor(4096, 2, 1)
    silent = context.createGain()
    silent.gain.value = 0
    source.connect(processor)
    processor.connect(silent)
    silent.connect(context.destination)
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      let closed = false
      const clean = () => {
        clearInterval(timer)
        signal.removeEventListener("abort", abort)
        video.removeEventListener("ended", done)
        video.removeEventListener("seeking", intent)
        video.removeEventListener("ratechange", rate)
        video.removeEventListener("pause", paused)
        if (processor) processor.onaudioprocess = null
      }
      const fail = (error: Error) => {
        if (closed) return
        closed = true
        clean()
        reject(error)
      }
      const abort = () => fail(new DOMException("Đã hủy", "AbortError"))
      const intent = () => {
        externalIntent = true
        fail(new Error("Đã hủy vì bạn tua video."))
      }
      const rate = () => {
        if (video.playbackRate !== 1) {
          externalIntent = true
          fail(new Error("Đã hủy vì tốc độ video thay đổi."))
        }
      }
      const paused = () => {
        if (video.paused && !video.ended) {
          externalIntent = true
          fail(new Error("Đã hủy vì video tạm dừng."))
        }
      }
      const done = () => {
        if (closed) return
        closed = true
        clean()
        try {
          const tail = encoder.flush()
          if (range && recordedFrames < context.sampleRate * 2) throw new Error("Audio quá ngắn.")
          size += tail.length
          if (size > SMART_AUDIO_LIMIT) {
            reject(new Error("Audio vượt 8 MiB."))
            return
          }
          parts.push(Uint8Array.from(tail))
          if (converter.peak < 0.0001) {
            reject(new Error("Không thu được tiếng. Chọn file audio tương ứng."))
            return
          }
          const result = new Uint8Array(size)
          let at = 0
          for (const part of parts) {
            result.set(part, at)
            at += part.length
          }
          resolve(result)
        } catch {
          reject(new Error("Không hoàn tất được audio. Hãy chọn MP3/WAV tương ứng."))
        }
      }
      processor!.onaudioprocess = (event) => {
        if (closed) return
        const length = range
          ? Math.min(event.inputBuffer.length, maxFrames - recordedFrames)
          : event.inputBuffer.length
        recordedFrames += length
        if (recordedFrames > maxFrames) {
          fail(new Error("Audio thu vượt giới hạn 10 phút."))
          return
        }
        let part: Uint8Array
        try {
          part = encoder.encodeBuffer(
            converter.convert(
              range
                ? {
                    length,
                    numberOfChannels: event.inputBuffer.numberOfChannels,
                    getChannelData: (channel: number) =>
                      event.inputBuffer.getChannelData(channel).subarray(0, length),
                  }
                : event.inputBuffer,
            ),
          )
        } catch {
          fail(new Error("Không xử lý được audio. Hãy chọn MP3/WAV tương ứng."))
          return
        }
        size += part.length
        if (size > SMART_AUDIO_LIMIT) {
          fail(new Error("Audio vượt 8 MiB."))
          return
        }
        parts.push(Uint8Array.from(part))
        if (range && recordedFrames >= maxFrames) done()
      }
      const started = performance.now(),
        timer = setInterval(() => {
          if (!valid() || video.currentSrc !== initialSrc)
            fail(new DOMException("Nguồn đã đổi", "AbortError"))
          else if (performance.now() - started > (duration + 60) * 1000)
            fail(new Error("Thu trước quá thời gian. Hãy chọn file audio."))
          else
            progress(
              `Đang thu trước ${Math.max(0, Math.floor(video.currentTime - start))} / ${Math.ceil(duration)} giây; có thể chuyển sang tab khác.`,
            )
        }, 500)
      signal.addEventListener("abort", abort, { once: true })
      video.addEventListener("ended", done, { once: true })
      video.addEventListener("seeking", intent)
      video.addEventListener("ratechange", rate)
      video.addEventListener("pause", paused)
      if (signal.aborted) {
        abort()
        return
      }
      void video.play().catch(() => fail(new Error("Hãy cho phép phát video rồi thử lại.")))
    })
    signal.throwIfAborted()
    return { audio: base64(bytes), format: "mp3", duration }
  } finally {
    removeSetupIntent()
    processor?.disconnect()
    source?.disconnect()
    silent?.disconnect()
    stream?.getTracks().forEach((t) => t.stop())
    await context.close().catch(() => {})
    if (
      touched &&
      canRestore() &&
      video.isConnected &&
      video.currentSrc === initialSrc &&
      !externalIntent &&
      (!settingUp ||
        (video.paused && video.currentTime === initialTime && video.playbackRate === initialRate))
    ) {
      video.pause()
      video.currentTime = initialTime
      if (video.playbackRate === 1) video.playbackRate = initialRate
    }
  }
}
