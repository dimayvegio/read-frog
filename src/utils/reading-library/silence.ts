/** Local level gate, not speech recognition. Initial silence never ends a take. */
export class SpeechEndDetector {
  private voiceStart: number | null = null
  private heardVoice = false
  private quietStart: number | null = null
  private lastTime = -Infinity
  constructor(private readonly silenceMs = 1500) {}
  push(rms: number, now: number): boolean {
    if (!Number.isFinite(rms) || !Number.isFinite(now) || rms < 0 || now < this.lastTime)
      return false
    this.lastTime = now
    if (rms >= 0.008) {
      this.voiceStart ??= now
      if (now - this.voiceStart >= 80) this.heardVoice = true
      this.quietStart = null
    } else {
      this.voiceStart = null
      if (rms >= 0.004) this.quietStart = null
      else if (this.heardVoice) {
        this.quietStart ??= now
        return now - this.quietStart >= this.silenceMs
      }
    }
    return false
  }
}

/** Owns one silent analyser graph; never connects the microphone to speakers. */
export function monitorRecordingSilence(
  stream: MediaStream,
  onSilence: () => void,
  onUnavailable: () => void,
): () => void {
  let disposed = false,
    timer: ReturnType<typeof setInterval> | undefined
  let context: AudioContext | undefined,
    source: MediaStreamAudioSourceNode | undefined,
    analyser: AnalyserNode | undefined
  const dispose = () => {
    if (disposed) return
    disposed = true
    if (timer) clearInterval(timer)
    try {
      source?.disconnect()
      analyser?.disconnect()
    } catch {
      /* A graph can already be disconnected. */
    }
    if (context && context.state !== "closed") void context.close().catch(() => {})
  }
  const unavailable = () => {
    if (!disposed) {
      dispose()
      onUnavailable()
    }
  }
  try {
    context = new AudioContext()
    source = context.createMediaStreamSource(stream)
    analyser = context.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    const samples = new Float32Array(analyser.fftSize),
      detector = new SpeechEndDetector()
    const poll = () => {
      if (disposed) return
      if (context?.state !== "running") {
        unavailable()
        return
      }
      try {
        analyser!.getFloatTimeDomainData(samples)
        let energy = 0
        for (const value of samples) energy += value * value
        if (detector.push(Math.sqrt(energy / samples.length), performance.now())) {
          dispose()
          onSilence()
        }
      } catch {
        unavailable()
      }
    }
    void context
      .resume()
      .then(() => {
        if (disposed) return
        if (context?.state !== "running") {
          unavailable()
          return
        }
        timer = setInterval(poll, 40)
      })
      .catch(unavailable)
  } catch {
    unavailable()
  }
  return dispose
}
