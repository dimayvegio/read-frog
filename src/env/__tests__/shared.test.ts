import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  createExtensionClientEnvSchema,
  isLocalPackagesEnabled,
  resolveExtensionEnv,
} from "../shared"
describe("local extension build environment", () => {
  it("builds without backend, OAuth or analytics variables", () => {
    expect(z.object(createExtensionClientEnvSchema()).parse(resolveExtensionEnv({}))).toEqual({})
  })
  it("retains all four Microsoft transport overrides", () => {
    const result = z.object(createExtensionClientEnvSchema()).parse(
      resolveExtensionEnv({
        WXT_EDGE_TTS_HTTP_ENABLED: "false",
        WXT_EDGE_TTS_TRUSTED_CLIENT_TOKEN: "token",
        WXT_EDGE_TTS_SIGNATURE_SECRET_BASE64: "base64",
        WXT_EDGE_TTS_SIGNATURE_APP_ID: "app",
      }),
    )
    expect(result).toMatchObject({
      WXT_EDGE_TTS_HTTP_ENABLED: false,
      WXT_EDGE_TTS_TRUSTED_CLIENT_TOKEN: "token",
      WXT_EDGE_TTS_SIGNATURE_APP_ID: "app",
    })
  })
  it("does not expose retired environment variables", () => {
    expect(
      resolveExtensionEnv({
        WXT_API_URL: "https://retired.invalid",
        WXT_POSTHOG_API_KEY: "sentinel",
      }),
    ).not.toHaveProperty("WXT_API_URL")
    expect(Object.keys(createExtensionClientEnvSchema())).not.toContain("WXT_POSTHOG_API_KEY")
  })
  it("keeps local-package development explicit", () => {
    expect(isLocalPackagesEnabled({})).toBe(false)
    expect(isLocalPackagesEnabled({ WXT_USE_LOCAL_PACKAGES: "true" })).toBe(true)
  })
})
