import { describe, expect, it } from "vitest"
import { sanitizeLocalCSS } from "../local-resource-policy"

describe("local CSS resource policy", () => {
  it("preserves ordinary styling and nested rules", () => {
    const css =
      ".word { color: red; font-family: system-ui; } @media (width > 600px) { .word { display: grid; } }"
    expect(sanitizeLocalCSS(css)).toBe(css)
  })
  it("removes imports, font downloads, image URLs and raw custom-property resources", () => {
    const safe = sanitizeLocalCSS(
      '@import "https://remote.invalid/style"; @font-face {font-family: x; src: url(https://remote.invalid/font)} .word { color: red; background: url(https://remote.invalid/pixel); --image: url(https://remote.invalid/other); mask-image: image-set("https://remote.invalid/mask" 1x); }',
    )
    expect(safe).not.toContain("remote.invalid")
    expect(safe).not.toContain("@import")
    expect(safe).toContain("color:red")
  })
  it("rejects escaped resources rather than permitting an obfuscated fetch", () => {
    expect(sanitizeLocalCSS(".word { background: u\\72l(https://remote.invalid) }")).toBe("")
  })
})
