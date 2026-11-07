import type { NativeSelectionRequest } from "@/types/native-selection"
import { sha256 } from "js-sha256"

// Keep the published document identity: URL without fragment or credentials.
export function identifyPdfDocument(
  url: string | undefined,
  title?: string,
): NativeSelectionRequest["document"] {
  try {
    const parsed = new URL(url ?? "")
    if (!["file:", "https:", "http:"].includes(parsed.protocol)) return undefined
    parsed.hash = ""
    parsed.username = ""
    parsed.password = ""
    let name = title?.trim()
    if (!name || parsed.protocol === "file:") {
      try {
        name = decodeURIComponent(parsed.pathname.split("/").at(-1) ?? "")
      } catch {
        name = "PDF"
      }
    }
    return {
      id: sha256(parsed.href),
      title: (name || "PDF").replace(/\p{Cc}/gu, " ").slice(0, 240),
    }
  } catch {
    return undefined
  }
}
export function localPdfDocument(url: string | undefined, title?: string) {
  try {
    const parsed = new URL(url ?? "")
    return parsed.protocol === "file:" && /\.pdf$/i.test(parsed.pathname)
      ? identifyPdfDocument(url, title)
      : undefined
  } catch {
    return undefined
  }
}
