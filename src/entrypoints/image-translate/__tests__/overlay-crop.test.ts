// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { MAX_IMAGE_DATA_URL } from "@/types/image-translation"
import { encodeCrop } from "../image"
afterEach(() => vi.restoreAllMocks())
it("keeps alpha/pixel dimensions for overlay PNG while retaining legacy white-flattened crops", () => {
  const fill = vi.fn<(...args: any[]) => void>(),
    draw = vi.fn<(...args: any[]) => void>()
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillRect: fill,
    drawImage: draw,
  } as any)
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/png;base64,iVBORw0KGgoAAA==",
  )
  const full = { x: 0, y: 0, width: 1, height: 1 }
  encodeCrop({} as CanvasImageSource, 200, 100, full, true)
  expect(fill).not.toHaveBeenCalled()
  expect(draw.mock.calls[0]!.slice(-2)).toEqual([200, 100])
  encodeCrop({} as CanvasImageSource, 200, 100, full)
  expect(fill).toHaveBeenCalledOnce()
})
it("rejects oversized overlay crops before downscaling or converting to JPEG", () => {
  const ctx = vi.spyOn(HTMLCanvasElement.prototype, "getContext")
  expect(() =>
    encodeCrop({} as CanvasImageSource, 6000, 4000, { x: 0, y: 0, width: 1, height: 1 }, true),
  ).toThrow(/không phải giảm/u)
  expect(ctx).not.toHaveBeenCalled()
})
it("does not silently replace an oversized lossless PNG with JPEG", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage() {} } as any)
  const encode = vi
    .spyOn(HTMLCanvasElement.prototype, "toDataURL")
    .mockReturnValue("data:image/png;base64,iVBORw0KGgo" + "A".repeat(MAX_IMAGE_DATA_URL))
  expect(() =>
    encodeCrop({} as CanvasImageSource, 200, 100, { x: 0, y: 0, width: 1, height: 1 }, true),
  ).toThrow(/độ trong suốt/u)
  expect(encode).toHaveBeenCalledExactlyOnceWith("image/png")
})
