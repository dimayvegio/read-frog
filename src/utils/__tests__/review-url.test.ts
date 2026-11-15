import { afterEach, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { FLOWREAD_STORE_IDS, FLOWREAD_SUPPORT_URL } from "@/utils/constants/flowread"
import { getReviewUrl } from "../utils"
const original = browser.runtime.id
afterEach(() => {
  Object.defineProperty(browser.runtime, "id", { configurable: true, value: original })
  delete FLOWREAD_STORE_IDS.chrome
  delete FLOWREAD_STORE_IDS.edge
  vi.unstubAllEnvs()
})
it.each(["unpacked", "modkelfkcfjpgbfmnbnllalkiogfofhb", "cbcbomlgikfbdnoaohcjfledcoklcjbo"])(
  "never sends an unassigned/upstream id to upstream reviews: %s",
  (id) => {
    Object.defineProperty(browser.runtime, "id", { configurable: true, value: id })
    expect(getReviewUrl()).toBe(FLOWREAD_SUPPORT_URL)
  },
)
it("uses only an explicitly assigned FlowRead store id", () => {
  FLOWREAD_STORE_IDS.chrome = "abcdefghijklmnopabcdefghijklmnop"
  Object.defineProperty(browser.runtime, "id", {
    configurable: true,
    value: FLOWREAD_STORE_IDS.chrome,
  })
  expect(getReviewUrl()).toBe(
    "https://chromewebstore.google.com/detail/flowread/abcdefghijklmnopabcdefghijklmnop/reviews",
  )
})
