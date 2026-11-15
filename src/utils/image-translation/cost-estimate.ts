import type { ImageEditRequest } from "./generated-schema"

export const IMAGE_PRICE_CHECKED = "2026-11-15"
/** Snapshot of OpenAI's public image-output calculator, not invoice usage.
 * https://developers.openai.com/api/docs/guides/image-generation#calculating-costs
 * Input image/text, taxes and any future price changes are deliberately excluded.
 */
export function estimateImageOutput(
  model: ImageEditRequest["model"],
  quality: ImageEditRequest["quality"],
  width: number,
  height: number,
) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width % 16 ||
    height % 16 ||
    width * height < 655360 ||
    width * height > 8294400 ||
    Math.max(width, height) > 3840 ||
    Math.min(width, height) <= 0 ||
    Math.max(width / height, height / width) > 3
  )
    return null
  const grid = { low: 16, medium: 24, high: 48, xhigh: 64, max: 96 }[quality]
  const short = grid / (Math.max(width, height) / Math.min(width, height))
  const lower = Math.floor(short)
  // The official calculator uses half-to-even rounding at exact .5 ties.
  const cells = short - lower === 0.5 ? lower + (lower % 2) : Math.round(short)
  const baseTokens = Math.ceil((grid * cells * (2_000_000 + width * height)) / 4_000_000)
  const multiplier = model.startsWith("gpt-image-2.6-")
    ? { low: 4.2, medium: 3.3, high: 1, xhigh: 1, max: 1 }[quality]
    : 1
  const outputTokens = Math.round(baseTokens * multiplier)
  return { outputTokens, outputUsd: (outputTokens * 30) / 1_000_000 }
}
