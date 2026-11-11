import { expect, it } from "vitest"
import { parsePdfZoom, stepPdfZoom, boundPdfZoom } from "../zoom"
it("accepts explicit percent input with comma/dot and bounds it to the existing numeric format", () => {
  for (const [input, expected] of [
    ["125%", 1.25],
    [" 125,5 % ", 1.255],
    ["10", 0.1],
    ["400%", 4],
    ["99.99", 0.9999],
  ] as const)
    expect(parsePdfZoom(input)).toBeCloseTo(expected, 8)
  for (const input of [
    "",
    "abc",
    "0",
    "401",
    "9.99",
    "1e2",
    "50%%",
    "NaN",
    "Infinity",
    "20;alert(1)",
  ])
    expect(parsePdfZoom(input)).toBeNull()
})
it("steps at ten percent without floating drift and clamps both ends", () => {
  expect(stepPdfZoom(1, 1)).toBe(1.1)
  expect(stepPdfZoom(1.1, -1)).toBe(1)
  expect(stepPdfZoom(0.1, -1)).toBe(0.1)
  expect(stepPdfZoom(4, 1)).toBe(4)
  expect(boundPdfZoom(0.0001)).toBe(0.1)
  expect(boundPdfZoom(10)).toBe(4)
})
