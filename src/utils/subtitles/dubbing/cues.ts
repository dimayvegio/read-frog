import type { SubtitlesFragment } from "@/utils/subtitles/types"
import { sha256 } from "js-sha256"
import { splitTextByUtf8Bytes } from "@/utils/server/edge-tts/chunk"
export type DubbingMode = "original" | "translated"
export interface DubbingCue {
  id: string
  text: string
  start: number
  end: number
}
const encoder = new TextEncoder()
/** Deterministic native boundaries: independent of playhead and translation arrival. */
export function buildDubbingCues(
  track: SubtitlesFragment[],
  mode: DubbingMode,
  translated: SubtitlesFragment[] = [],
): DubbingCue[] {
  const groups: SubtitlesFragment[][] = []
  let count = 0,
    lastStart = -1
  const input =
    mode === "original"
      ? track
      : translated.slice(0, 20000).map((f) => ({ ...f, text: f.translation ?? "" }))
  for (const f of input.slice(0, 20000)) {
    if (
      !Number.isFinite(f.start) ||
      !Number.isFinite(f.end) ||
      f.start < lastStart ||
      f.start < 0 ||
      f.end <= f.start ||
      !f.text.trim()
    )
      continue
    count += f.text.length
    if (count > 2000000) break
    lastStart = f.start
    const g = groups.at(-1),
      previous = g?.at(-1)
    if (
      mode === "original" &&
      g &&
      previous &&
      f.start - previous.end >= -20 &&
      f.start - previous.end <= 350 &&
      f.end - g[0]!.start <= 8000 &&
      !/[.!?。！？]["'’”)]*$/u.test(previous.text.trim()) &&
      encoder.encode(g.map((x) => x.text).join(" ") + f.text).length <= 1600
    )
      g.push(f)
    else groups.push([f])
  }
  const result: DubbingCue[] = []
  for (const g of groups) {
    const start = g[0]!.start,
      end = g.at(-1)!.end
    const text = g.map((f) => f.text.trim()).join(" ")
    const parts = splitTextByUtf8Bytes(text, 1600)
    let offset = 0
    for (const part of parts) {
      const a = start + ((end - start) * offset) / text.length
      offset += part.length
      const b = start + ((end - start) * offset) / text.length
      result.push({
        id: sha256(JSON.stringify(["dubbing-v1", mode, a, b, part])),
        text: part,
        start: a,
        end: b,
      })
    }
  }
  return result
}
export function dubbingWindow(cues: DubbingCue[], time: number): DubbingCue[] {
  let lo = 0,
    hi = cues.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (cues[mid]!.end <= time) lo = mid + 1
    else hi = mid
  }
  return cues.slice(lo, lo + 6).filter((c) => c.start <= time + 30000)
}
