import { beforeEach, describe, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { onMessage, sendMessage } from "../message"

describe("extension messaging", () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it("round-trips async responses through the callback-based browser API", async () => {
    const removeListener = onMessage("getInitialConfig", async () => ({
      ok: false as const,
      code: "STORAGE_UNAVAILABLE" as const,
      retryable: true,
    }))

    try {
      await expect(sendMessage("getInitialConfig", undefined)).resolves.toMatchObject({
        ok: false,
        code: "STORAGE_UNAVAILABLE",
      })
    } finally {
      removeListener()
    }
  })
})
