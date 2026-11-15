import { afterEach, expect, it, vi } from "vitest"
import { fullCaptionContext, heardCaptions, remapHeardProfile } from "../automatic"
import { runAutomaticAnalysis } from "../automatic-run"
import { parseSmartProfile } from "../smart"
const track = [
  { text: "before", start: 0, end: 1000 },
  { text: "first", start: 2000, end: 4000 },
  { text: "second", start: 5000, end: 7000 },
  { text: "later", start: 605000, end: 607000 },
]
const profile = (cues: typeof track) =>
  parseSmartProfile(
    {
      audioMatchesTranscript: true,
      summary: "topic",
      context: "topic",
      speakers: [
        {
          id: "s1",
          presentation: "unclear",
          description: "calm",
          voice: "marin",
          speed: 1,
          instructions: "calm",
        },
      ],
      assignments: [{ from: 0, to: cues.length - 1, speaker: "s1", confidence: 0.9 }],
    },
    cues,
  )
afterEach(() => vi.useRealTimers())
it("maps only fully heard native captions, with playback-rate normalization and no invented indices", () => {
  const h = heardCaptions(track, 1500, 8000, 2)
  expect(h.indices).toEqual([1, 2])
  expect(h.cues[0]?.start).toBe(250)
  const p = remapHeardProfile(profile(h.cues), h.indices, track)
  expect(p.assignments).toEqual([{ from: 1, to: 2, speaker: "s1", confidence: 0.9 }])
  const gapped = remapHeardProfile(profile([track[0]!, track[2]!]), [0, 2], track)
  expect(gapped.assignments.map((a) => [a.from, a.to])).toEqual([
    [0, 0],
    [2, 2],
  ])
})
it("bounds transcript context before allocating a whole long video transcript", () => {
  const context = fullCaptionContext(
    Array.from({ length: 20000 }, (_, i) => ({
      text: (i === 19999 ? "LAST" : "x").repeat(1000),
      start: i,
      end: i + 1,
    })),
  )
  expect(context.length).toBeLessThan(100000)
  expect(context).toContain("excerpt omitted")
  expect(context).toContain("LAST")
})
it("runs on a video longer than ten minutes, without files or repeated paid work in the same part", async () => {
  vi.useFakeTimers()
  const c = new AbortController(),
    video = {
      currentTime: 2,
      playbackRate: 1,
      paused: false,
      ended: false,
      duration: 1800,
    } as HTMLVideoElement
  const analyze = vi.fn<(...args: any[]) => any>(async (input) => profile(input.cues))
  const sample = vi.fn<(...args: any[]) => any>(async () => ({
    audio: "UklGRjAwMDBXQVZFMDAwMA==",
    format: "wav",
    duration: 6.5,
    start: 1500,
    end: 8000,
    rate: 1,
  }))
  const apply = vi.fn<(...args: any[]) => any>()
  const task = runAutomaticAnalysis({
    video,
    signal: c.signal,
    valid: () => !c.signal.aborted,
    source: async () => track,
    key: async () => ({ configured: true, revision: 1 }),
    sample,
    analyze,
    apply,
    status: () => {},
    sourceUrl: "https://www.youtube.com/watch?v=x",
    title: "title",
    target: "vi",
  }).catch((e) => e)
  await vi.advanceTimersByTimeAsync(2000)
  expect(analyze).toHaveBeenCalledOnce()
  expect(sample).toHaveBeenCalledOnce()
  expect(apply).toHaveBeenCalledOnce()
  expect(analyze.mock.calls[0]![0].contextTranscript).toContain("later")
  expect(video.currentTime).toBe(2)
  expect(video.paused).toBe(false)
  video.currentTime = 605
  await vi.advanceTimersByTimeAsync(500)
  expect(analyze).toHaveBeenCalledTimes(2)
  video.currentTime = 2
  await vi.advanceTimersByTimeAsync(500)
  expect(analyze).toHaveBeenCalledTimes(2)
  c.abort()
  await task
})
it("does not automatically retry a failed paid analysis", async () => {
  const c = new AbortController(),
    analyze = vi.fn<(...args: any[]) => any>().mockRejectedValue(new Error("API failed"))
  await expect(
    runAutomaticAnalysis({
      video: { currentTime: 2, playbackRate: 1, paused: false } as HTMLVideoElement,
      signal: c.signal,
      valid: () => true,
      source: async () => track,
      key: async () => ({ configured: true, revision: 1 }),
      sample: async () => ({
        audio: "a",
        format: "mp3",
        duration: 6.5,
        start: 1500,
        end: 8000,
        rate: 1,
      }),
      analyze,
      apply: () => {},
      status: () => {},
      sourceUrl: "https://ani.pm/ani/test",
      title: "t",
      target: "vi",
    }),
  ).rejects.toThrow(/API failed/)
  expect(analyze).toHaveBeenCalledOnce()
})
