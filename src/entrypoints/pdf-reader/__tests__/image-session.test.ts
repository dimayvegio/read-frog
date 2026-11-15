import { beforeEach, expect, it, vi } from "vitest"
import { PdfImageSession } from "../image-session"
const image = { image: "data:image/png;base64,TEST", width: 200, height: 300 }
let session: PdfImageSession
const current = vi.fn<() => Promise<void>>()
const render = vi.fn<(...args: any[]) => any>()
const generate = vi.fn<(...args: any[]) => any>()
const deps = (identity = "doc-a-vi-model-high") => ({
  scope: async () => ({ identity, current }),
  render,
  generate,
})
beforeEach(() => {
  session = new PdfImageSession()
  vi.clearAllMocks()
  current.mockResolvedValue()
  render.mockImplementation(async (page) => ({ image: "PAGE-" + page, width: 612, height: 792 }))
  generate.mockResolvedValue(image)
})
it("runs four pages sequentially, keeps original page numbers and reuses all four images on repeats", async () => {
  let pending = 0,
    maximum = 0
  generate.mockImplementation(async () => {
    pending++
    maximum = Math.max(maximum, pending)
    await Promise.resolve()
    pending--
    return image
  })
  await session.run([1, 2, 3, 4], deps())
  expect(maximum).toBe(1)
  expect(generate).toHaveBeenCalledTimes(4)
  expect(session.getSnapshot().order).toEqual([1, 2, 3, 4])
  expect(session.getSnapshot().rows[4]?.value).toMatchObject({
    page: 4,
    width: 612,
    height: 792,
    result: image,
  })
  await session.run([1, 2, 3, 4], deps())
  expect(generate).toHaveBeenCalledTimes(4)
  expect(render).toHaveBeenCalledTimes(4)
})
it("keeps completed pages on a failure and only resumes the missing page explicitly", async () => {
  generate.mockResolvedValueOnce(image).mockRejectedValueOnce(new Error("IE-HTTP-429"))
  await session.run([1, 2, 3, 4], deps())
  expect(generate).toHaveBeenCalledTimes(2)
  expect(session.getSnapshot().rows[1]?.status).toBe("done")
  expect(session.getSnapshot().rows[2]?.status).toBe("error")
  await session.run([1, 2, 3, 4], deps())
  expect(generate).toHaveBeenCalledTimes(5)
})
it("discards late cancelled results and never advances to another page", async () => {
  let done!: (value: typeof image) => void
  generate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        done = resolve
      }),
  )
  const run = session.run([1, 2], deps())
  await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce())
  session.cancel()
  done(image)
  await run
  expect(session.getSnapshot().rows[1]?.value).toBeUndefined()
  expect(generate).toHaveBeenCalledOnce()
  expect(session.getSnapshot().busy).toBe(false)
})
it("checks ownership again after rendering before billing, including a changed document", async () => {
  render.mockImplementationOnce(async () => {
    current.mockRejectedValue(new DOMException("Tài liệu đã đổi", "AbortError"))
    return { image: "SOURCE", width: 100, height: 100 }
  })
  await session.run([1, 2], deps())
  expect(generate).not.toHaveBeenCalled()
  expect(session.getSnapshot().message).toContain("Tài liệu đã đổi")
})
it("does not reuse images across model/target/key/source/rotation scope changes", async () => {
  await session.run([1], deps())
  await session.run([1], deps("different-owner"))
  expect(generate).toHaveBeenCalledTimes(2)
})
it("rejects a stale post-generation result without caching or continuing it", async () => {
  generate.mockImplementationOnce(async () => {
    current.mockRejectedValue(new DOMException("Khóa đã đổi", "AbortError"))
    return image
  })
  await session.run([1, 2], deps())
  expect(session.getSnapshot().rows[1]?.value).toBeUndefined()
  expect(session.getSnapshot().message).toContain("Khóa đã đổi")
  expect(generate).toHaveBeenCalledOnce()
})
it("rejects invalid ranges without calling even the scope resolver", async () => {
  for (const pages of [[], [1, 1], [0], [NaN], Array.from({ length: 21 }, (_, i) => i + 1)])
    await expect(session.run(pages, deps())).rejects.toThrow("Dải trang")
  expect(generate).not.toHaveBeenCalled()
})
it("reserves bounded RAM before another paid call and never silently evicts completed images", async () => {
  generate.mockResolvedValue({ ...image, image: "x".repeat(32 * 1024 * 1024) })
  await session.run([1, 2, 3, 4], deps())
  expect(generate).toHaveBeenCalledTimes(2)
  expect(session.getSnapshot().message).toContain("RAM")
  expect(session.getSnapshot().rows[1]?.value).toBeDefined()
  expect(session.getSnapshot().rows[2]?.value).toBeDefined()
})
it("a new job cannot be polluted by an obsolete job after clear", async () => {
  let done!: (value: typeof image) => void
  generate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        done = resolve
      }),
  )
  const old = session.run([1, 2], deps())
  await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce())
  session.clear()
  await session.run([4], deps("new"))
  done(image)
  await old
  expect(session.getSnapshot().order).toEqual([4])
  expect(session.getSnapshot().rows[1]).toBeUndefined()
})
it("view/subscription/clear/destroy controls never start a provider", () => {
  const notify = vi.fn<() => void>()
  const unsubscribe = session.subscribe(notify)
  session.getSnapshot()
  session.cancel()
  session.clear()
  unsubscribe()
  session.destroy()
  expect(generate).not.toHaveBeenCalled()
  expect(render).not.toHaveBeenCalled()
})
