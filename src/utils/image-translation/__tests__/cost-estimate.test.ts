import { expect, it } from "vitest"
import { estimateImageOutput } from "../cost-estimate"
it("matches the official 1024-square low-quality GPT Image 2.6 calculator example", () => {
  expect(estimateImageOutput("gpt-image-2.6-sunburst", "low", 1024, 1024)).toEqual({
    outputTokens: 823,
    outputUsd: 0.02469,
  })
  expect(estimateImageOutput("gpt-image-2.6-flare", "low", 1024, 1024)).toEqual({
    outputTokens: 823,
    outputUsd: 0.02469,
  })
})
it("accounts for model generation, quality and output size without assuming input costs are zero", () => {
  const low = estimateImageOutput("gpt-image-2.5-sunburst", "low", 1024, 1024)!
  expect(low.outputTokens).toBe(196)
  expect(
    estimateImageOutput("gpt-image-2.6-sunburst", "high", 1024, 1024)!.outputUsd,
  ).toBeGreaterThan(low.outputUsd)
  expect(
    estimateImageOutput("gpt-image-2.6-sunburst", "max", 2880, 2880)!.outputUsd,
  ).toBeGreaterThan(estimateImageOutput("gpt-image-2.6-sunburst", "max", 1024, 1024)!.outputUsd)
  expect(Object.keys(low)).toEqual(["outputTokens", "outputUsd"])
})
it("does not invent a price for unsupported or unknown dimensions", () => {
  for (const [width, height] of [
    [0, 0],
    [1, 1],
    [NaN, 1024],
    [4096, 4096],
    [3840, 1024],
    [1025, 1024],
  ])
    expect(estimateImageOutput("gpt-image-2.6-sunburst", "high", width!, height!)).toBeNull()
})
