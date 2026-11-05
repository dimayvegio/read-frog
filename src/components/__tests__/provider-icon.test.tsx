// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import ProviderIcon from "../provider-icon"
describe("local provider icon", () => {
  it("always renders the packaged OpenAI logo", () => {
    render(<ProviderIcon name="OpenAI" logo="https://untrusted.invalid/icon.png" />)
    expect(screen.getByRole("img").getAttribute("src")).not.toMatch(/^https?:/)
    expect(screen.getByRole("img")).toHaveAttribute("alt", "OpenAI")
  })
})
