// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { overlayRegions, detectOverlayRegions } from "../overlay-ocr"
const { create, recognize, terminate } = vi.hoisted(() => ({
  create: vi.fn<(...args: any[]) => any>(),
  recognize: vi.fn<(...args: any[]) => any>(),
  terminate: vi.fn<() => Promise<void>>(),
}))
vi.mock("tesseract.js", () => ({
  createWorker: create,
  OEM: { LSTM_ONLY: 1 },
  PSM: { SPARSE_TEXT: "11" },
}))
const image = "data:image/png;base64,iVBORw0KGgoAAA=="
const result = {
  data: {
    blocks: [
      {
        paragraphs: [
          {
            lines: [
              {
                words: [
                  { text: "Hello", font_name: "Arial", bbox: { x0: 10, y0: 10, x1: 50, y1: 25 } },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
}
const close = vi.fn<() => void>()
beforeEach(() => {
  vi.clearAllMocks()
  terminate.mockResolvedValue()
  recognize.mockResolvedValue(result)
  create.mockResolvedValue({ recognize, terminate, setParameters: async () => {} })
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn<() => Promise<any>>().mockResolvedValue({ width: 100, height: 100, close }),
  )
  vi.stubGlobal(
    "fetch",
    vi.fn<() => Promise<any>>().mockResolvedValue({ blob: async () => new Blob() }),
  )
  const data = new Uint8ClampedArray(40000).fill(255)
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage() {},
    getImageData: () => ({ width: 100, height: 100, data }),
  } as any)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it("uses only fixed bundled assets, sparse geometry, and releases bitmap/worker after recognition", async () => {
  const resultValue = await detectOverlayRegions(
    image,
    "eng",
    new AbortController().signal,
    () => {},
  )
  expect(resultValue.regions[0]!.source).toBe("Hello")
  expect(create.mock.calls[0]![2]).toMatchObject({
    workerBlobURL: false,
    cacheMethod: "none",
    gzip: true,
  })
  expect(create.mock.calls[0]![2].workerPath).toContain("/ocr-assets/worker.min.js")
  expect(terminate).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
})
it("rejects remote images and already-aborted requests before starting a worker", async () => {
  await expect(
    detectOverlayRegions(
      "https://example.com/a.png",
      "eng",
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toThrow(/./u)
  const abort = new AbortController()
  abort.abort()
  await expect(detectOverlayRegions(image, "eng", abort.signal, () => {})).rejects.toThrow(
    /abort/iu,
  )
  expect(create).not.toHaveBeenCalled()
})
it("cancel during initialization rejects promptly but keeps one lease until the late worker is terminated", async () => {
  let finish: (worker: any) => void = () => {}
  create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const abort = new AbortController(),
    run = detectOverlayRegions(image, "eng", abort.signal, () => {})
  const rejected = run.then(
    () => ({ message: "unexpected success" }),
    (error: Error) => ({ message: error.message }),
  )
  await vi.waitFor(() => expect(create).toHaveBeenCalledOnce())
  abort.abort()
  expect((await rejected).message).toMatch(/dừng/u)
  await expect(
    detectOverlayRegions(image, "eng", new AbortController().signal, () => {}),
  ).rejects.toThrow(/OCR trước/u)
  finish({ recognize, terminate, setParameters: async () => {} })
  await vi.waitFor(() => expect(terminate).toHaveBeenCalledOnce())
  await detectOverlayRegions(image, "eng", new AbortController().signal, () => {})
  expect(recognize).toHaveBeenCalledOnce()
  expect(create).toHaveBeenCalledTimes(2)
})
it("cancel during recognition terminates exactly once and permits a later explicit run", async () => {
  recognize.mockImplementationOnce(() => new Promise(() => {}))
  const abort = new AbortController(),
    run = detectOverlayRegions(image, "eng", abort.signal, () => {})
  const rejected = run.then(
    () => ({ message: "unexpected success" }),
    (error: Error) => ({ message: error.message }),
  )
  await vi.waitFor(() => expect(recognize).toHaveBeenCalledOnce())
  abort.abort()
  expect((await rejected).message).toMatch(/dừng/u)
  await vi.waitFor(() => expect(terminate).toHaveBeenCalledOnce())
  await detectOverlayRegions(image, "eng", new AbortController().signal, () => {})
  expect(create).toHaveBeenCalledTimes(2)
})

it("keeps neighboring lines from different OCR paragraphs separate", () => {
  const line = (y: number) => ({
    words: [{ text: "Example", font_name: "Arial", bbox: { x0: 10, y0: y, x1: 60, y1: y + 10 } }],
  })
  const pixels = {
    width: 100,
    height: 100,
    data: new Uint8ClampedArray(40000).fill(255),
  } as ImageData
  const input = {
    blocks: [{ paragraphs: [{ lines: [line(10)] }, { lines: [line(25)] }] }],
  } as unknown as Parameters<typeof overlayRegions>[0]
  expect(overlayRegions(input, pixels)).toHaveLength(2)
})
it("merges only aligned wraps in the same paragraph and preserves their line break", () => {
  const line = (y: number) => ({
    words: [{ text: "Example", font_name: "Arial", bbox: { x0: 10, y0: y, x1: 60, y1: y + 10 } }],
  })
  const pixels = {
    width: 100,
    height: 100,
    data: new Uint8ClampedArray(40000).fill(255),
  } as ImageData
  const input = {
    blocks: [{ paragraphs: [{ lines: [line(10), line(25)] }] }],
  } as unknown as Parameters<typeof overlayRegions>[0]
  const regions = overlayRegions(input, pixels)
  expect(regions).toHaveLength(1)
  expect(regions[0]!.source).toBe("Example\nExample")
  // A continuous table rule blocks an otherwise geometrically valid merge.
  for (let x = 10; x <= 60; x++) for (let k = 0; k < 3; k++) pixels.data[(22 * 100 + x) * 4 + k] = 0
  expect(overlayRegions(input, pixels)).toHaveLength(2)
})
