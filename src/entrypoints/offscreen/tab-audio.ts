import { browser } from "#imports"
import { MAX_AUDIO_FILE } from "@/utils/audio-transcription/schema"
import {
  LiveTranscript,
  type TabNotice,
  type TabOptions,
} from "@/utils/audio-transcription/tab-schema"
import { onMessage, sendMessage } from "@/utils/message"
import { SpeechEndDetector } from "@/utils/reading-library/silence"
import { isTrustedOptionsSender } from "../background/settings-sender"

let active: TabCapture | null = null
const urls = new Map<string, ReturnType<typeof setTimeout>>()
function release(url: string) {
  const timer = urls.get(url)
  if (timer) {
    clearTimeout(timer)
    urls.delete(url)
    URL.revokeObjectURL(url)
  }
}
function checkSender(sender: Parameters<typeof isTrustedOptionsSender>[0]) {
  if (!isTrustedOptionsSender(sender, browser.runtime.id, browser.runtime.getURL("/background.js")))
    throw new Error("Invalid tab capture sender")
}

class TabCapture {
  private disposed = false
  private finishing: Promise<void> | null = null
  private stream?: MediaStream
  private uplink?: MediaStream
  private context?: AudioContext
  private source?: MediaStreamAudioSourceNode
  private analyser?: AnalyserNode
  private peer?: RTCPeerConnection
  private channel?: RTCDataChannel
  private recorder?: MediaRecorder
  private chunks: Blob[] = []
  private bytes = 0
  private timers: ReturnType<typeof setInterval>[] = []
  private transcript = new LiveTranscript()
  private commits = 0
  private completions = new Set<string>()
  constructor(
    readonly session: string,
    private options: TabOptions & { shortTurns?: boolean },
  ) {}
  private notice(value: TabNotice) {
    void browser.runtime
      .sendMessage({ target: "read-frog-tab-audio-notice", ...value })
      .catch(() => {})
  }
  async start(streamId: string) {
    try {
      this.timers.push(
        setTimeout(() => {
          if (!this.stream)
            void this.finish(true, "Trình duyệt chưa mở được luồng thu âm. Hãy mở lượt mới.", true)
        }, 15000),
      )
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId },
        } as MediaTrackConstraints,
      })
      if (this.disposed) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      this.stream = stream
      for (const track of stream.getTracks())
        track.addEventListener(
          "ended",
          () => {
            void this.finish(false, "Tab nguồn đã ngừng phát hoặc đã đóng.", true)
          },
          { once: true },
        )
      this.context = new AudioContext()
      this.source = this.context.createMediaStreamSource(stream)
      // tabCapture suppresses native playback. Restore it only for this captured tab.
      this.source.connect(this.context.destination)
      await this.context.resume()
      if (this.disposed) return
      if (this.context.state !== "running") throw new Error("Chưa khôi phục được âm thanh tab.")
      this.timers.push(
        setInterval(() => {
          void sendMessage("tabAudioAlive", { session: this.session })
            .then((ok) => {
              if (!ok) void this.finish(true, "Lượt thu đã hết hạn hoặc khóa OpenAI đã đổi.", true)
            })
            .catch(() => {
              void this.finish(true, "Kết nối extension bị ngắt.", true)
            })
        }, 15000),
      )
      this.timers.push(
        setInterval(
          () => {
            void this.finish(false, "Đã đạt giới hạn 30 phút. Tải kết quả rồi mở lượt mới.", false)
          },
          30 * 60 * 1000,
        ),
      )
      if (this.options.mode === "record") this.record(stream)
      else await this.live(stream)
    } catch {
      await this.finish(
        true,
        "Chưa kết nối được âm thanh hoặc OpenAI. Kiểm tra tab nguồn, key, quyền dùng model và hạn mức rồi mở lượt mới; không tự gửi lại.",
        true,
      )
    }
  }
  private record(stream: MediaStream) {
    if (!MediaRecorder.isTypeSupported("audio/webm;codecs=opus"))
      throw new Error("WebM recording unavailable")
    const recorder = (this.recorder = new MediaRecorder(stream, {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 96000,
    }))
    recorder.ondataavailable = (event) => {
      if (this.disposed || !event.data.size) return
      if (this.bytes + event.data.size > MAX_AUDIO_FILE) {
        void this.finish(
          false,
          "Đã đạt giới hạn dung lượng thu. Tải hoặc chuyển bản thu hiện có.",
          false,
        )
        return
      }
      this.chunks.push(event.data)
      this.bytes += event.data.size
      if (this.bytes >= MAX_AUDIO_FILE - 1000000)
        void this.finish(
          false,
          "Đã đạt giới hạn dung lượng thu. Chuyển bản thu hiện có hoặc tải nó về.",
          false,
        )
    }
    recorder.onerror = () => {
      void this.finish(true, "Trình duyệt không thu tiếp được âm thanh.", true)
    }
    recorder.start(1000)
    this.notice({ type: "started", session: this.session })
  }
  private async live(stream: MediaStream) {
    const peer = (this.peer = new RTCPeerConnection())
    // Gating the uplink must not silence the local playback restoration graph.
    const uplink = (this.uplink = new MediaStream(
      stream.getAudioTracks().map((track) => track.clone()),
    ))
    for (const track of uplink.getAudioTracks()) {
      track.enabled = false
      peer.addTrack(track, uplink)
    }
    const channel = (this.channel = peer.createDataChannel("oai-events"))
    let opened = false
    const connectionTimer = setTimeout(() => {
      if (!opened) void this.finish(true, "OpenAI kết nối quá lâu. Hãy mở lượt mới.", true)
    }, 35000)
    this.timers.push(connectionTimer)
    channel.onopen = () => {
      if (this.disposed || this.finishing) return
      opened = true
      clearTimeout(connectionTimer)
      uplink.getAudioTracks().forEach((track) => {
        track.enabled = true
      })
      this.monitorTurns()
      this.notice({ type: "started", session: this.session })
    }
    channel.onmessage = (event) => {
      if (this.disposed || typeof event.data !== "string") return
      try {
        if (event.data.length > 2 * 1024 * 1024) throw new Error("Realtime event limit")
        const value = JSON.parse(event.data) as Record<string, unknown>
        if (
          value.type === "error" ||
          value.type === "conversation.item.input_audio_transcription.failed"
        )
          throw new Error("Realtime transcription failed")
        if (
          value.type === "conversation.item.input_audio_transcription.completed" &&
          typeof value.item_id === "string"
        )
          this.completions.add(value.item_id)
        const text = this.transcript.update(value)
        if (text) this.notice({ type: "text", session: this.session, ...text })
      } catch {
        void this.finish(
          true,
          "Luồng chép lời bị ngắt hoặc đạt giới hạn. Phần chưa chốt là bản nháp; tải kết quả trước khi mở lượt mới.",
          true,
        )
      }
    }
    channel.onclose = () => {
      clearTimeout(connectionTimer)
      if (!this.finishing)
        void this.finish(true, "OpenAI đã đóng kết nối. Phần chưa chốt là bản nháp.", true)
    }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed")
        void this.finish(true, "Mất kết nối OpenAI. Không tự gửi lại âm thanh.", true)
    }
    const offer = await peer.createOffer()
    if (this.disposed || this.finishing) {
      clearTimeout(connectionTimer)
      return
    }
    await peer.setLocalDescription(offer)
    const sdp = await sendMessage("tabAudioOffer", { session: this.session, sdp: offer.sdp ?? "" })
    if (this.disposed || this.finishing) {
      clearTimeout(connectionTimer)
      return
    }
    await peer.setRemoteDescription({ type: "answer", sdp })
  }
  private commit() {
    if (this.channel?.readyState === "open") {
      this.channel.send(JSON.stringify({ type: "input_audio_buffer.commit" }))
      this.commits++
    }
  }
  private monitorTurns() {
    if (!this.context || !this.source) return
    const analyser = (this.analyser = this.context.createAnalyser())
    analyser.fftSize = 2048
    this.source.connect(analyser)
    const samples = new Float32Array(analyser.fftSize)
    let detector = new SpeechEndDetector(900),
      started = this.context.currentTime,
      voiced = 0
    this.timers.push(
      setInterval(() => {
        if (
          this.disposed ||
          this.finishing ||
          this.context?.state !== "running" ||
          this.channel?.readyState !== "open"
        )
          return
        analyser.getFloatTimeDomainData(samples)
        const rms = Math.sqrt(
          samples.reduce((sum, value) => sum + value * value, 0) / samples.length,
        )
        if (rms >= 0.008) voiced += 50
        const now = this.context.currentTime
        if (detector.push(rms, now * 1000) || now - started >= (this.options.shortTurns ? 6 : 15)) {
          if (voiced >= 100) this.commit()
          else this.channel.send(JSON.stringify({ type: "input_audio_buffer.clear" }))
          detector = new SpeechEndDetector(900)
          started = now
          voiced = 0
        }
      }, 50),
    )
  }
  finish(discard: boolean, message: string, failed: boolean): Promise<void> {
    if (this.finishing) return this.finishing
    this.finishing = this.finishInternal(discard, message, failed)
    return this.finishing
  }
  private async finishInternal(discard: boolean, message: string, failed: boolean) {
    for (const timer of this.timers) clearInterval(timer)
    this.timers = []
    if (this.recorder && this.recorder.state !== "inactive") {
      const recorder = this.recorder
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true })
        recorder.stop()
      })
    }
    this.stream?.getTracks().forEach((track) => track.stop())
    this.uplink?.getTracks().forEach((track) => track.stop())
    this.source?.disconnect()
    this.analyser?.disconnect()
    if (this.context && this.context.state !== "closed") await this.context.close().catch(() => {})
    if (this.options.mode === "live" && !discard && this.channel?.readyState === "open") {
      // Explicit stop finalizes the remaining audio turn; retain a bounded drain.
      this.commit()
      const until = Date.now() + 8000
      while (
        this.completions.size < this.commits &&
        Date.now() < until &&
        this.channel.readyState === "open"
      )
        await new Promise((resolve) => setTimeout(resolve, 100))
      if (this.completions.size < this.commits) {
        failed = true
        message = "Đã dừng thu. Câu cuối chưa chốt kịp; phần đó là bản nháp."
      }
    }
    this.disposed = true
    this.channel?.close()
    this.peer?.close()
    if (!discard && this.options.mode === "record" && this.bytes >= 16) {
      const blob = new Blob(this.chunks, { type: "audio/webm" })
      const url = URL.createObjectURL(blob)
      urls.set(
        url,
        setTimeout(() => release(url), 300000),
      )
      this.notice({ type: "recording", session: this.session, url, size: blob.size })
    }
    this.chunks = []
    this.bytes = 0
    this.notice({ type: "stopped", session: this.session, message, partial: failed })
    void sendMessage("tabAudioEnded", { session: this.session, failed }).catch(() => {})
    if (active === this) active = null
  }
}

export function setupOffscreenTabAudio() {
  onMessage("tabAudioStartOffscreen", (message) => {
    checkSender(message.sender)
    if (active) throw new Error("Tab capture is busy")
    for (const url of urls.keys()) release(url)
    const capture = (active = new TabCapture(message.data.session, message.data))
    void capture.start(message.data.streamId)
  })
  onMessage("tabAudioStopOffscreen", async (message) => {
    checkSender(message.sender)
    if (active?.session === message.data.session)
      await active.finish(
        message.data.discard,
        message.data.discard ? "Đã hủy thu âm." : "Đã dừng thu âm.",
        message.data.discard,
      )
  })
  onMessage("tabAudioReleaseOffscreen", (message) => {
    checkSender(message.sender)
    release(message.data.url)
  })
}
