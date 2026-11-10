import { TextDecoder, TextEncoder } from "node:util"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { readTranscriptionResponse } from "../response"
import { subtitleResult, subtitleTimestamp, toSrt } from "../subtitles"

beforeEach(() => {
  vi.stubGlobal("TextEncoder", TextEncoder)
  vi.stubGlobal("TextDecoder", TextDecoder)
})
afterEach(() => vi.unstubAllGlobals())
const fixture = () => ({
  text: "Hello. Xin chào.",
  duration: 8,
  segments: [
    { start: 1.25, end: 2.5, text: "Hello." },
    { start: 4.75, end: 7.9996, text: "Xin chào." },
  ],
})
it("exports provider cue times with real gaps and millisecond/hour carry without proportional text alignment", () => {
  const result = subtitleResult(fixture())
  expect(result.model).toBe("whisper-1")
  expect(result.seconds).toBeNull()
  expect(toSrt(result.segments!)).toBe(
    "1\r\n00:00:01,250 --> 00:00:02,500\r\nHello.\r\n\r\n2\r\n00:00:04,750 --> 00:00:08,000\r\nXin chào.\r\n",
  )
  expect(subtitleTimestamp(3599.9996)).toBe("01:00:00,000")
})
it("rejects missing, reversed, overlapping, nonfinite or zero-length timelines instead of fabricating SRT", () => {
  for (const segments of [
    [],
    [{ start: 2, end: 1, text: "wrong" }],
    [{ start: -1, end: 1, text: "wrong" }],
    [{ start: 0, end: NaN, text: "wrong" }],
    [{ start: 0, end: 10, text: "wrong" }],
    [{ start: 1, end: 1.00001, text: "wrong" }],
    [
      { start: 0, end: 2, text: "first" },
      { start: 1, end: 3, text: "overlap" },
    ],
  ])
    expect(() => subtitleResult({ ...fixture(), segments })).toThrow(
      /subtitle|Missing|Invalid|small/i,
    )
})
it("keeps finite rounding-safe adjacent cues and bounds output while rejecting SRT delimiter injection", () => {
  expect(
    subtitleResult({
      text: "Two cues",
      duration: 3,
      segments: [
        { start: 0, end: 1.20000000001, text: "First" },
        { start: 1.2, end: 3, text: "Second" },
      ],
    }).segments,
  ).toHaveLength(2)
  expect(() => toSrt([{ start: 0, end: 1, text: "fake --> timeline" }])).toThrow(/timeline/)
  expect(() => subtitleTimestamp(Infinity)).toThrow(/time/)
})
it("reads timed JSON once, keeps actual billed usage separate from duration and rejects untimed text responses", async () => {
  const response = new Response(
    JSON.stringify({ ...fixture(), usage: { type: "duration", seconds: 9 } }),
    { headers: { "content-type": "application/json" } },
  )
  const result = await readTranscriptionResponse(
    response,
    new AbortController().signal,
    () => {},
    true,
  )
  expect(result.result.seconds).toBe(9)
  expect(result.result.segments?.[1]?.start).toBe(4.75)
  await expect(
    readTranscriptionResponse(
      new Response(JSON.stringify({ text: "No timestamps" })),
      new AbortController().signal,
      () => {},
      true,
    ),
  ).rejects.toThrow(/expected|Invalid|Required/i)
})
