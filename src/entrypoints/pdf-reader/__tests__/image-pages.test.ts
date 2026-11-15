import type { PDFDocumentProxy } from "pdfjs-dist"
import { PDFDocument } from "pdf-lib"
import { afterEach, expect, it, vi } from "vitest"
import { archiveImagePages, assembleImagePdf, renderImagePage } from "../image-pages"
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXsAAAAASUVORK5CYII="
const rows = [1, 2, 3, 4].map((page) => ({
  page,
  width: 612,
  height: 792,
  result: { image: `data:image/png;base64,${png}`, width: 1, height: 1 },
}))
afterEach(() => vi.unstubAllGlobals())
it("assembles four output images into a local PDF in original page sizes with no source binary", async () => {
  const blob = await assembleImagePdf(rows, new AbortController().signal)
  const pdf = await PDFDocument.load(await blob.arrayBuffer())
  expect(pdf.getPageCount()).toBe(4)
  expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 })
  expect(pdf.getPage(3).getSize()).toEqual({ width: 612, height: 792 })
})
it("archives original PNG bytes and original page numbers without image recompression", async () => {
  const { default: JSZip } = await import("jszip")
  const zip = await archiveImagePages([rows[3]!, rows[0]!], new AbortController().signal)
  const archive = await JSZip.loadAsync(await zip.arrayBuffer())
  expect(Object.keys(archive.files)).toEqual(["trang-0004.png", "trang-0001.png"])
  expect(await archive.file("trang-0004.png")!.async("base64")).toBe(png)
})
it("does not produce a partial export on cancellation", async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(assembleImagePdf(rows, controller.signal)).rejects.toThrow("abort")
  await expect(archiveImagePages(rows, controller.signal)).rejects.toThrow("abort")
})
it("renders only one requested full page with bounded pixels and releases its canvas without cleaning the shared reader page", async () => {
  const canvas = { width: 0, height: 0, toDataURL: () => rows[0]!.result.image }
  const render = vi.fn<(...args: any[]) => any>(() => ({
    promise: Promise.resolve(),
    cancel: vi.fn<() => void>(),
  }))
  const cleanup = vi.fn<() => void>()
  const pdf = {
    getPage: async (n: number) => {
      expect(n).toBe(4)
      return {
        rotate: 0,
        cleanup,
        render,
        getViewport: ({ scale, rotation }: any) => ({
          width: 612 * scale,
          height: 792 * scale,
          rotation,
        }),
      }
    },
  } as unknown as PDFDocumentProxy
  vi.stubGlobal("document", { createElement: () => canvas })
  expect(await renderImagePage(pdf, 4, 144, 0, new AbortController().signal)).toMatchObject({
    width: 612,
    height: 792,
  })
  expect(render.mock.calls[0]![0].viewport).toMatchObject({ width: 1224, height: 1584 })
  expect(canvas.width).toBe(0)
  expect(canvas.height).toBe(0)
  expect(cleanup).not.toHaveBeenCalled()
})
it("does not allocate a raster after an old page lookup resolves following cancellation", async () => {
  let resolve!: (value: unknown) => void
  const pdf = {
    getPage: () =>
      new Promise((done) => {
        resolve = done
      }),
  } as unknown as PDFDocumentProxy
  const createElement = vi.fn<() => void>()
  vi.stubGlobal("document", { createElement })
  const controller = new AbortController(),
    task = renderImagePage(pdf, 1, 144, 0, controller.signal)
  controller.abort()
  resolve({})
  await expect(task).rejects.toThrow("abort")
  expect(createElement).not.toHaveBeenCalled()
})
