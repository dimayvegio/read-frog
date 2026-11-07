import { expect, it } from "vitest"
import { imageDataURLSchema, MAX_IMAGE_DATA_URL } from "@/types/image-translation"
import { cropBetween, cropPixels } from "../image"
it("maps reverse drags and out-of-bounds pointers to the same normalized crop", () => {
  expect(cropBetween({ x: 0.8, y: 0.9 }, { x: 0.2, y: 0.1 })).toEqual(
    cropBetween({ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.9 }),
  )
  expect(cropBetween({ x: -0.5, y: -1 }, { x: 2, y: 1.5 })).toEqual({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  })
})
it("maps a scaled preview to exact natural screenshot pixels independently of device pixel ratio", () => {
  expect(cropPixels({ x: 0.25, y: 0.2, width: 0.5, height: 0.4 }, 2000, 1000)).toEqual({
    x: 500,
    y: 200,
    width: 1000,
    height: 400,
  })
  expect(cropPixels({ x: 0.999, y: 0, width: 0.5, height: 1 }, 1000, 100)).toEqual({
    x: 999,
    y: 0,
    width: 1,
    height: 100,
  })
})
it("allows only bounded PNG/JPEG data, rejecting remote images, SVG, invalid base64 and oversized payloads", () => {
  expect(imageDataURLSchema.safeParse("data:image/png;base64,iVBORw0KGgoAAA==").success).toBe(true)
  for (const value of [
    "https://example.com/image.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,invalid%data",
    "data:image/png;base64,iVBORw0KGgo" + "A".repeat(MAX_IMAGE_DATA_URL),
  ])
    expect(imageDataURLSchema.safeParse(value).success).toBe(false)
})
