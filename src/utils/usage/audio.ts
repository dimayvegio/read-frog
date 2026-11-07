import { z } from "zod"
const realtimeUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  input_token_details: z
    .object({ cached_tokens: z.number().int().nonnegative().optional() })
    .optional(),
})
export function realtimeUsageFields(input: unknown) {
  const parsed = realtimeUsageSchema.safeParse(input)
  return parsed.success
    ? {
        input: parsed.data.input_tokens,
        output: parsed.data.output_tokens,
        cachedInput: parsed.data.input_token_details?.cached_tokens ?? 0,
      }
    : {}
}
export function wavDurationMs(bytes: Uint8Array): number | null {
  if (bytes.length < 44) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    ascii = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))
  if (ascii(0) !== "RIFF" || ascii(8) !== "WAVE") return null
  let byteRate = 0,
    dataSize = 0
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = view.getUint32(at + 4, true),
      end = at + 8 + size
    if (end > bytes.length) return null
    if (ascii(at) === "fmt " && size >= 16) {
      if (view.getUint16(at + 8, true) !== 1) return null
      byteRate = view.getUint32(at + 16, true)
    }
    if (ascii(at) === "data") dataSize += size
    at = end + (size & 1)
  }
  return byteRate > 0 && dataSize > 0 ? (dataSize / byteRate) * 1000 : null
}
