import { describe, expect, it, vi } from "vitest"
import { PROCESS_LOOK_AHEAD_MS, TRANSLATE_LOOK_AHEAD_MS } from "@/utils/constants/subtitles"
import { SegmentationPipeline } from "../segmentation-pipeline"

vi.mock("@/utils/subtitles/processor/ai-segmentation", () => ({
  aiSegmentBlock: vi.fn<(...args: any[]) => any>().mockRejectedValue(new Error("ai failed")),
}))

const LOCAL_REF = { kind: "local" as const, config: { id: "openai-default" } as never }

describe("segmentation pipeline", () => {
  it("replaces overlapping baseline fragments when AI fallback is used", async () => {
    const rawFragments = [
      { text: "hello", start: 0, end: 500 },
      { text: "world", start: 500, end: 1000 },
    ]

    const pipeline = new SegmentationPipeline({
      baselineFragments: [{ text: "hello world", start: 0, end: 1000 }],
      rawFragments,
      getVideoElement: () => ({ currentTime: 0 }) as HTMLVideoElement,
      getSourceLanguage: () => "en",
      providerRef: LOCAL_REF,
    })

    await (pipeline as any).processNextChunk(0)

    expect(pipeline.processedFragments).toEqual([{ text: "hello world", start: 0, end: 1000 }])
  })

  it("does not segment past the look-ahead window from the current position", async () => {
    // 10 minutes of word-level fragments, one per second.
    const rawFragments = Array.from({ length: 600 }, (_, i) => ({
      text: `w${i}`,
      start: i * 1000,
      end: i * 1000 + 1000,
    }))

    const pipeline = new SegmentationPipeline({
      rawFragments,
      // Playback stays at the very beginning (e.g. paused right after enabling).
      getVideoElement: () => ({ currentTime: 0 }) as HTMLVideoElement,
      getSourceLanguage: () => "en",
      providerRef: LOCAL_REF,
      preSegmented: true,
    })

    await (pipeline as any).runLoop()

    const segmentedStarts = (pipeline as any).segmentedRawStarts as Set<number>

    // The window ahead of the playhead is segmented...
    expect(segmentedStarts.has(0)).toBe(true)

    // Supply cues through the two-minute translation boundary, retaining
    // one-minute chunks and stopping before the rest of the video.
    expect(segmentedStarts.has(120_000)).toBe(true)
    const furthestSegmented = Math.max(...segmentedStarts)
    expect(furthestSegmented).toBeLessThan(TRANSLATE_LOOK_AHEAD_MS + PROCESS_LOOK_AHEAD_MS)
    expect(pipeline.hasUnprocessedChunks()).toBe(true)
  })

  it("widens the segmentation look-ahead window with playback rate", async () => {
    // 10 minutes of word-level fragments, one per second.
    const rawFragments = Array.from({ length: 600 }, (_, i) => ({
      text: `w${i}`,
      start: i * 1000,
      end: i * 1000 + 1000,
    }))

    const pipeline = new SegmentationPipeline({
      rawFragments,
      getVideoElement: () => ({ currentTime: 0, playbackRate: 3 }) as HTMLVideoElement,
      getSourceLanguage: () => "en",
      providerRef: LOCAL_REF,
      preSegmented: true,
    })

    await (pipeline as any).runLoop()

    const segmentedStarts = (pipeline as any).segmentedRawStarts as Set<number>
    const furthestSegmented = Math.max(...segmentedStarts)

    // At 3x the window is 3x wider, so the buffer reaches past the 1x bound...
    expect(furthestSegmented).toBeGreaterThan(TRANSLATE_LOOK_AHEAD_MS + PROCESS_LOOK_AHEAD_MS)
    // The last admitted chunk may extend by one processing window.
    expect(furthestSegmented).toBeLessThan(3 * (TRANSLATE_LOOK_AHEAD_MS + PROCESS_LOOK_AHEAD_MS))
    expect(pipeline.hasUnprocessedChunks()).toBe(true)
  })

  it("segments the next window once playback advances into it", async () => {
    const rawFragments = Array.from({ length: 600 }, (_, i) => ({
      text: `w${i}`,
      start: i * 1000,
      end: i * 1000 + 1000,
    }))

    let currentTime = 0
    const pipeline = new SegmentationPipeline({
      rawFragments,
      getVideoElement: () =>
        ({
          get currentTime() {
            return currentTime
          },
        }) as HTMLVideoElement,
      getSourceLanguage: () => "en",
      providerRef: LOCAL_REF,
      preSegmented: true,
    })

    await (pipeline as any).runLoop()
    const afterStart = Math.max(...((pipeline as any).segmentedRawStarts as Set<number>))

    // Playback moves into the buffered region; the pipeline should top the window back up
    // rather than stay starved behind its own bound.
    currentTime = 150
    await (pipeline as any).runLoop()
    const afterAdvance = Math.max(...((pipeline as any).segmentedRawStarts as Set<number>))

    expect(afterAdvance).toBeGreaterThan(afterStart)
    expect(afterAdvance).toBeLessThan(150_000 + TRANSLATE_LOOK_AHEAD_MS + PROCESS_LOOK_AHEAD_MS)
  })

  it("keeps AI segmentation requests to one-minute chunks while feeding the two-minute buffer", async () => {
    const { aiSegmentBlock } = await import("@/utils/subtitles/processor/ai-segmentation")
    vi.mocked(aiSegmentBlock).mockClear()
    const rawFragments = Array.from({ length: 600 }, (_, i) => ({
      text: `w${i}`,
      start: i * 1000,
      end: (i + 1) * 1000,
    }))
    const pipeline = new SegmentationPipeline({
      rawFragments,
      getVideoElement: () => ({ currentTime: 0, playbackRate: 1 }) as HTMLVideoElement,
      getSourceLanguage: () => "en",
      providerRef: LOCAL_REF,
    })
    await (pipeline as any).runLoop()
    const batches = vi.mocked(aiSegmentBlock).mock.calls.map(([batch]) => batch)
    expect(batches).toHaveLength(3)
    expect(batches.every((batch) => batch.at(-1)!.end - batch[0]!.start <= 60_000)).toBe(true)
    expect(pipeline.processedFragments.some((fragment) => fragment.start === 120_000)).toBe(true)
    expect(pipeline.hasUnprocessedChunks()).toBe(true)
  })

  it("notifies onChunkSegmented after replacing a processed chunk", async () => {
    const rawFragments = [
      { text: "hello", start: 0, end: 500 },
      { text: "world", start: 500, end: 1000 },
    ]
    const onChunkSegmented = vi.fn<(...args: any[]) => any>()

    const pipeline = new SegmentationPipeline({
      baselineFragments: [{ text: "hello world", start: 0, end: 1000 }],
      rawFragments,
      getVideoElement: () => ({ currentTime: 0 }) as HTMLVideoElement,
      getSourceLanguage: () => "en",
      providerRef: LOCAL_REF,
      onChunkSegmented,
    })

    await (pipeline as any).processNextChunk(0)

    expect(onChunkSegmented).toHaveBeenCalledTimes(1)
    expect(onChunkSegmented).toHaveBeenCalledWith(rawFragments, [
      { text: "hello world", start: 0, end: 1000 },
    ])
  })

  it("falls back to local optimize without a provider ref instead of orphaning the chunk", async () => {
    const rawFragments = [
      { text: "hello", start: 0, end: 500 },
      { text: "world", start: 500, end: 1000 },
    ]
    const onChunkSegmented = vi.fn<(...args: any[]) => any>()
    const { aiSegmentBlock } = await import("@/utils/subtitles/processor/ai-segmentation")
    const aiCallsBefore = vi.mocked(aiSegmentBlock).mock.calls.length

    const pipeline = new SegmentationPipeline({
      baselineFragments: [{ text: "hello world", start: 0, end: 1000 }],
      rawFragments,
      getVideoElement: () => ({ currentTime: 0 }) as HTMLVideoElement,
      getSourceLanguage: () => "en",
      providerRef: null,
      onChunkSegmented,
    })

    await (pipeline as any).processNextChunk(0)

    expect(vi.mocked(aiSegmentBlock).mock.calls.length).toBe(aiCallsBefore)
    expect(onChunkSegmented).toHaveBeenCalled()
    // Starts must not remain "segmented" with no replacement applied.
    expect(pipeline.processedFragments.length).toBeGreaterThan(0)
  })

  it("replaceProcessedChunk drops cues that overlap the window by interval", () => {
    const pipeline = new SegmentationPipeline({
      baselineFragments: [
        { text: "spans into window", start: 0, end: 1500 },
        { text: "after", start: 2000, end: 3000 },
      ],
      rawFragments: [
        { text: "a", start: 1000, end: 1500 },
        { text: "b", start: 1500, end: 2000 },
      ],
      getVideoElement: () => ({ currentTime: 0 }) as HTMLVideoElement,
      getSourceLanguage: () => "en",
      providerRef: LOCAL_REF,
    })

    ;(pipeline as any).replaceProcessedChunk(
      [
        { text: "a", start: 1000, end: 1500 },
        { text: "b", start: 1500, end: 2000 },
      ],
      [{ text: "recut", start: 1000, end: 2000 }],
    )

    expect(pipeline.processedFragments).toEqual([
      { text: "recut", start: 1000, end: 2000 },
      { text: "after", start: 2000, end: 3000 },
    ])
  })

  it("does not apply segmentation results after stop", async () => {
    const rawFragments = [
      { text: "hello", start: 0, end: 500 },
      { text: "world", start: 500, end: 1000 },
    ]
    const onChunkSegmented = vi.fn<(...args: any[]) => any>()
    let resolveAi: (value: any) => void
    const aiPromise = new Promise((resolve) => {
      resolveAi = resolve
    })

    const { aiSegmentBlock } = await import("@/utils/subtitles/processor/ai-segmentation")
    vi.mocked(aiSegmentBlock).mockImplementationOnce(() => aiPromise as any)

    const pipeline = new SegmentationPipeline({
      baselineFragments: [{ text: "hello world", start: 0, end: 1000 }],
      rawFragments,
      getVideoElement: () => ({ currentTime: 0 }) as HTMLVideoElement,
      getSourceLanguage: () => "en",
      providerRef: LOCAL_REF,
      onChunkSegmented,
    })

    const pending = (pipeline as any).processNextChunk(0)
    pipeline.stop()
    resolveAi!([{ text: "hello world", start: 0, end: 1000 }])
    await pending

    expect(onChunkSegmented).not.toHaveBeenCalled()
    // Baseline fragments remain untouched after stop mid-flight.
    expect(pipeline.processedFragments).toEqual([{ text: "hello world", start: 0, end: 1000 }])
  })
})
