import { afterEach, expect, it, vi } from "vitest"
import { PdfAutosave } from "../autosave"
const { send } = vi.hoisted(() => ({ send: vi.fn<(...args: any[]) => any>() }))
vi.mock("@/utils/message", () => ({ sendMessage: send }))
const position = {
  documentId: "a".repeat(64),
  historyDocumentId: "a".repeat(64),
  title: "Book.pdf",
  pageCount: 20,
  page: 8,
  offset: 0.3,
  zoom: "fit-width" as const,
}
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})
it("debounces scrolling and flushes continuous reading within 1.5 seconds", async () => {
  vi.useFakeTimers()
  send.mockResolvedValue("saved")
  const saver = new PdfAutosave(2, vi.fn<(text: string) => void>())
  for (let n = 0; n < 8; n++) {
    saver.record({ ...position, offset: n / 10 })
    await vi.advanceTimersByTimeAsync(200)
  }
  expect(send).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0]?.[1]).toMatchObject({ epoch: 2, position: { page: 8, offset: 0.7 } })
  saver.stop()
})
it("flushes the last observed timestamp on close and pauses after a remote forget", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(10000)
  send.mockResolvedValue("cleared")
  const status = vi.fn<(text: string) => void>(),
    saver = new PdfAutosave(0, status)
  saver.record(position)
  vi.setSystemTime(11000)
  saver.flush()
  await Promise.resolve()
  expect(send.mock.calls[0]?.[1].position.updatedAt).toBe(10000)
  saver.record({ ...position, page: 9 })
  await vi.advanceTimersByTimeAsync(2000)
  expect(send).toHaveBeenCalledTimes(1)
  expect(status).toHaveBeenLastCalledWith(expect.stringContaining("cửa sổ khác"))
})
