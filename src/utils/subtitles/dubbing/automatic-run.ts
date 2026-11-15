import type { AutomaticAudio } from "./automatic-audio"
import type { SmartProfile, SmartVideoRequest } from "./smart"
import type { SubtitlesFragment } from "@/utils/subtitles/types"
import {
  AUTO_WINDOW_SECONDS,
  fullCaptionContext,
  heardCaptions,
  remapHeardProfile,
} from "./automatic"
import { parseSmartProfile, smartTrackHash } from "./smart"
interface Dependencies {
  video: HTMLVideoElement
  signal: AbortSignal
  valid: () => boolean
  source: () => Promise<SubtitlesFragment[]>
  key: () => Promise<{ configured: boolean; revision: number }>
  sample: () => Promise<AutomaticAudio>
  analyze: (input: SmartVideoRequest) => Promise<SmartProfile>
  apply: (profile: SmartProfile) => void
  status: (message: string) => void
  sourceUrl: string
  title: string
  target: string
}
function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException("Đã dừng", "AbortError"))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort)
      resolve()
    }, 500)
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) abort()
  })
}
/** One request per distinct ten-minute part. A failed paid request never retries itself. */
export async function runAutomaticAnalysis(d: Dependencies) {
  const key = await d.key()
  d.signal.throwIfAborted()
  if (!key.configured) throw new Error("Chưa cấu hình khóa OpenAI.")
  const track = await d.source()
  d.signal.throwIfAborted()
  if (!track.length) throw new Error("Cần CC gốc để tự phân tích ngữ cảnh.")
  const contextTranscript = fullCaptionContext(track),
    attempted = new Set<number>()
  const assertCurrent = async () => {
    if (!d.valid()) throw new DOMException("Nguồn đã đổi", "AbortError")
    const now = await d.key()
    d.signal.throwIfAborted()
    if (!now.configured || now.revision !== key.revision)
      throw new Error("Khóa OpenAI đã đổi. Bật AI lại khi sẵn sàng.")
  }
  while (!d.signal.aborted && d.valid()) {
    const window = Math.floor(d.video.currentTime / AUTO_WINDOW_SECONDS)
    const time = d.video.currentTime * 1000
    const upcoming = track.some(
      (c) => c.end > time && c.start < time + 15000 * d.video.playbackRate,
    )
    if (d.video.paused || d.video.ended || attempted.has(window) || !upcoming) {
      await pause(d.signal)
      continue
    }
    if (attempted.size >= 128) throw new Error("Đã hết giới hạn các phần AI trong phiên này.")
    let audio: AutomaticAudio
    try {
      audio = await d.sample()
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError" &&
        !d.signal.aborted &&
        d.valid()
      ) {
        await pause(d.signal)
        continue
      }
      throw error
    }
    d.signal.throwIfAborted()
    const heard = heardCaptions(track, audio.start, audio.end, audio.rate)
    if (!heard.cues.length) {
      attempted.add(window)
      d.status("Mẫu chưa có câu CC trọn vẹn. Phần này giữ giọng mặc định.")
      continue
    }
    await assertCurrent()
    attempted.add(window)
    d.status("AI đang phân tích audio và ngữ cảnh CC; bạn tiếp tục xem.")
    const result = await d.analyze({
      audio: audio.audio,
      format: audio.format,
      duration: audio.duration,
      cues: heard.cues,
      contextTranscript,
      sourceUrl: d.sourceUrl,
      title: d.title,
      target: d.target,
    })
    await assertCurrent()
    if (result.trackHash !== smartTrackHash(heard.cues)) throw new Error("CC phân tích đã đổi.")
    const { trackHash: _hash, ...wire } = result
    const profile = remapHeardProfile(parseSmartProfile(wire, heard.cues), heard.indices, track)
    d.apply(profile)
    d.status(
      "Đã áp dụng ngữ cảnh AI. Tự lấy mẫu ở phần 10 phút mới; câu chưa rõ giọng dùng mặc định.",
    )
  }
}
