import type { PDFDocumentProxy } from "pdfjs-dist"
import { afterEach, expect, it, vi } from "vitest"
import { LocalPdfOcr } from "../local-ocr"
const mocks = vi.hoisted(() => {
  const terminate = vi.fn<() => Promise<void>>(async () => {})
  const recognize = vi.fn<() => Promise<any>>(async () => ({ data: { blocks: [] } }))
  const worker = { terminate, recognize }
  return { worker, createWorker: vi.fn<() => Promise<any>>(async () => worker) }
})
vi.mock("tesseract.js", () => ({ createWorker: mocks.createWorker, OEM: { LSTM_ONLY: 1 } }))
const pdf = {
  numPages: 8,
  getPage: async () => ({
    getViewport: () => ({ width: 612, height: 792 }),
    render: () => ({ promise: Promise.resolve(), cancel() {} }),
  }),
} as unknown as PDFDocumentProxy
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
it("reuses one local worker for a range, rejects language switching, and terminates explicitly", async () => {
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0 }) })
  const session = new LocalPdfOcr()
  await session.read(pdf, 1, "eng", () => {})
  await session.read(pdf, 2, "eng", () => {})
  expect(mocks.createWorker).toHaveBeenCalledTimes(1)
  expect(mocks.worker.recognize).toHaveBeenCalledTimes(2)
  expect(mocks.worker.terminate).not.toHaveBeenCalled()
  await expect(session.read(pdf, 3, "vie", () => {})).rejects.toThrow("Phiên OCR")
  session.cancel()
  expect(mocks.worker.terminate).toHaveBeenCalledTimes(1)
  await expect(session.read(pdf, 3, "eng", () => {})).rejects.toThrow("Phiên OCR")
})
it("cancels pending initialization and terminates the late worker without rendering", async () => {
  let finish!: (worker: any) => void
  mocks.createWorker.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const session = new LocalPdfOcr(),
    result = session.read(pdf, 1, "eng", () => {})
  const rejected = result.catch((error) => error as Error)
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"))
  session.cancel()
  expect(await rejected).toMatchObject({ message: "Đã dừng OCR." })
  finish(mocks.worker)
  await vi.waitFor(() => expect(mocks.worker.terminate).toHaveBeenCalledTimes(1))
  expect(mocks.worker.recognize).not.toHaveBeenCalled()
})
