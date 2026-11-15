import type { SmartProfile } from "./smart"
import type { SubtitlesFragment } from "@/utils/subtitles/types"
import { parseSmartProfile } from "./smart"
export const AUTO_SAMPLE_SECONDS = 15
export const AUTO_WINDOW_SECONDS = 600
export function heardCaptions(
  track: SubtitlesFragment[],
  start: number,
  end: number,
  rate: number,
) {
  const indices: number[] = []
  const cues: SubtitlesFragment[] = []
  for (let i = 0; i < track.length; i++) {
    const c = track[i]!
    if (c.start < start || c.end > end || c.end <= c.start) continue
    indices.push(i)
    cues.push({ text: c.text, start: (c.start - start) / rate, end: (c.end - start) / rate })
    if (cues.length >= 1500) break
  }
  return { indices, cues }
}
export function fullCaptionContext(track: SubtitlesFragment[]) {
  const head: string[] = []
  let used = 0,
    truncated = false
  for (let i = 0; i < Math.min(track.length, 20000); i++) {
    const text = track[i]!.text
    if (used + text.length + 1 > 90000) {
      head.push(text.slice(0, Math.max(0, 90000 - used)))
      truncated = true
      break
    }
    head.push(text)
    used += text.length + 1
  }
  const prefix = head.join("\n")
  if (!truncated) return prefix
  const tail: string[] = []
  let left = 29900
  for (let i = Math.min(track.length, 20000) - 1; i >= 0 && left > 0; i--) {
    const text = track[i]!.text.slice(-left)
    tail.push(text)
    left -= text.length + 1
  }
  return prefix.slice(0, 60000) + "\n[transcript excerpt omitted]\n" + tail.reverse().join("\n")
}
/** Native indices only; never assign a partly heard/missing caption between selected indices. */
export function remapHeardProfile(
  profile: SmartProfile,
  indices: number[],
  track: SubtitlesFragment[],
) {
  const assignments: SmartProfile["assignments"] = []
  for (const a of profile.assignments) {
    for (let i = a.from; i <= a.to; i++) {
      const n = indices[i]
      if (n === undefined) throw new Error("Audio caption mapping changed")
      const last = assignments.at(-1)
      if (
        last &&
        last.to + 1 === n &&
        last.speaker === a.speaker &&
        last.confidence === a.confidence
      )
        last.to = n
      else assignments.push({ ...a, from: n, to: n })
    }
  }
  const { trackHash: _hash, ...wire } = profile
  return parseSmartProfile({ ...wire, assignments }, track)
}
