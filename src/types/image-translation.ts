import { z } from "zod"
export const MAX_IMAGE_DATA_URL = 12 * 1024 * 1024
export const imageDataURLSchema = z
  .string()
  .max(MAX_IMAGE_DATA_URL)
  .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/)
  .refine(
    (value) =>
      value.startsWith("data:image/png;base64,iVBORw0KGgo") ||
      value.startsWith("data:image/jpeg;base64,/9j/"),
    "Unsupported image data",
  )
export interface CapturedImage {
  image: string
  createdAt: number
}

// Wire schema intentionally stays simple for structured-output model compatibility.
export const imagePairWireSchema = z.strictObject({ original: z.string(), translation: z.string() })
export const imagePairSchema = z.strictObject({
  original: z.string().max(20000),
  translation: z.string().max(60000),
})
export type ImagePair = z.infer<typeof imagePairSchema>
export interface ImagePretranslation {
  original: string
  output: string
  identity: string
}
export const IMAGE_CAPTURE_COMMAND = "capture-and-translate"
