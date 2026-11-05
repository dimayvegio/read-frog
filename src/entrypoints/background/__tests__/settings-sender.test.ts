import { describe, expect, it } from "vitest"
import { isTrustedOptionsSender } from "../settings-sender"

describe("credential sender boundary", () => {
  const options = "chrome-extension://extension-id/options.html"
  it("accepts top-level options with hash navigation", () => {
    expect(
      isTrustedOptionsSender(
        { id: "extension-id", url: `${options}#/api-providers`, frameId: 0 },
        "extension-id",
        options,
      ),
    ).toBe(true)
  })
  it.each([
    undefined,
    {},
    { id: "other", url: options },
    { id: "extension-id", url: "https://example.org/options.html" },
    { id: "extension-id", url: `${options}/other` },
    { id: "extension-id", url: "chrome-extension://extension-id.evil/options.html" },
    { id: "extension-id", url: options, frameId: 1 },
    { id: "extension-id", url: "invalid" },
  ])("rejects untrusted contexts", (sender) => {
    expect(isTrustedOptionsSender(sender, "extension-id", options)).toBe(false)
  })
})
