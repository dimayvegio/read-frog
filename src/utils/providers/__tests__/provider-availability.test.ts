import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { checkProviderAvailability, resolvePageTranslationProvider } from "../provider-ref"
describe("public provider availability", () => {
  it("does no account or credential IO in shared contexts", async () => {
    const result = await checkProviderAvailability(resolvePageTranslationProvider(DEFAULT_CONFIG))
    expect(result).toMatchObject({
      available: true,
      providerRef: { kind: "local", config: { id: "openai-default" } },
    })
  })
})
