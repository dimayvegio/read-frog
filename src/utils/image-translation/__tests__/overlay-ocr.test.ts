// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { detectOverlayRegions } from "../overlay-ocr"
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
