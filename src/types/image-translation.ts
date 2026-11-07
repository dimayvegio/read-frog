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
