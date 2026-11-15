import type { Page } from "tesseract.js"
import { expect, it } from "vitest"
import {
  clampBox,
  decodeOverlayReply,
  fitOverlayText,
  sampleColors,
  type OverlayRegion,
} from "../overlay-model"
import { overlayRegions } from "../overlay-ocr"

const region: OverlayRegion = {
  id: "r0",
  source: "Hello",
  translation: "Xin chào",
  box: { x: 10, y: 10, width: 100, height: 24 },
  ink: [{ x: 10, y: 10, width: 50, height: 18 }],
  enabled: true,
  font: "sans-serif",
  size: 20,
  color: "#111111",
  background: null,
  bold: false,
  italic: false,
}
const pixels = (alpha = 255) => {
  const data = new Uint8ClampedArray(200 * 100 * 4).fill(255)
  for (let i = 3; i < data.length; i += 4) data[i] = alpha
  return { width: 200, height: 100, data } as ImageData
}
it("keeps locally measured geometry/style and source cache identity after vision corrects OCR", () => {
  const output = decodeOverlayReply(
    '{"regions":[{"id":"r0","original":"Hello!","translation":"Xin chào!"}]}',
    [region],
  )
  expect(output[0]).toEqual({ ...region, readText: "Hello!", translation: "Xin chào!" })
  expect(output[0]!.source).toBe("Hello")
  expect(output[0]!.box).toEqual(region.box)
})
it.each([
  '{"regions":[]}',
  '{"regions":[{"id":"other","original":"x","translation":"y"}]}',
  '{"regions":[{"id":"r0","original":"x","translation":"y","x":5}]}',
  '{"regions":[{"id":"r0","original":"x","translation":""}]}',
  '{"regions":[{"id":"r0","original":"x","translation":"y"},{"id":"r0","original":"x","translation":"y"}]}',
])("rejects missing/duplicate/extra IDs and AI-supplied coordinates", (raw) =>
  expect(() => decodeOverlayReply(raw, [region])).toThrow(/./u),
)
it("does not accept AI output for regions the user kept original", () => {
  expect(() =>
    decodeOverlayReply('{"regions":[{"id":"r0","original":"x","translation":"y"}]}', [
      { ...region, enabled: false },
    ]),
  ).toThrow(/thiếu/u)
})
it("bounds finite display rectangles and rejects NaN", () => {
  expect(clampBox({ x: -5, y: 999, width: 999, height: 0 }, 200, 100)).toEqual({
    x: 0,
    y: 96,
    width: 200,
    height: 4,
  })
  expect(() => clampBox({ ...region.box, x: NaN }, 200, 100)).toThrow(/Tọa độ/u)
})
it("samples flat color/alpha locally instead of treating model colors as truth", () => {
  expect(sampleColors(pixels(), region.ink[0]!)).toMatchObject({
    background: "#ffffff",
    transparent: false,
  })
  expect(sampleColors(pixels(0), region.ink[0]!).transparent).toBe(true)
})
it("fits long translations with bounded measurement and reports an impossible box", () => {
  let count = 0
  const metric = {
    font: "",
    measureText(text: string) {
      count++
      return { width: text.length * (parseFloat(metric.font) || 20) * 0.5 }
    },
  }
  const ctx = metric as unknown as CanvasRenderingContext2D
  const fitted = fitOverlayText(ctx, {
    ...region,
    translation: "A long translated text with several words",
  })
  expect(fitted.size).toBeLessThan(region.size)
  expect(fitted.overflow).toBe(false)
  expect(count).toBeLessThan(1000)
  expect(
    fitOverlayText(ctx, { ...region, box: { x: 0, y: 0, width: 4, height: 4 } }).overflow,
  ).toBe(true)
})
it("splits large table-column gaps and keeps code unpainted by default", () => {
  const word = (text: string, x: number, y: number) => ({
    text,
    bbox: { x0: x, y0: y, x1: x + 20, y1: y + 15 },
    font_name: "Arial",
  })
  const data = {
    blocks: [
      {
        paragraphs: [
          {
            lines: [
              { words: [word("Name", 10, 10), word("Value", 120, 10)] },
              { words: [word("assign;", 10, 50)] },
            ],
          },
        ],
      },
    ],
  } as unknown as Pick<Page, "blocks">
  const regions = overlayRegions(data, pixels())
  expect(regions).toHaveLength(3)
  expect(regions[0]!.source).toBe("Name")
  expect(regions[1]!.source).toBe("Value")
  expect(regions[2]!.enabled).toBe(false)
  expect(regions[0]!.ink).toEqual([{ x: 10, y: 10, width: 20, height: 15 }])
})
