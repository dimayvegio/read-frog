import { z } from "zod"

export type RawExtensionEnv = Record<string, string | boolean | undefined>
const rawBooleanSchema = z
  .union([z.stringbool({ truthy: ["true"], falsy: ["false"] }), z.boolean()])
  .optional()

export function isLocalPackagesEnabled(rawEnv: RawExtensionEnv) {
  return rawBooleanSchema.parse(rawEnv.WXT_USE_LOCAL_PACKAGES) ?? false
}

export const LOCAL_PACKAGES_DEDUPE = [
  "react",
  "react-dom",
  "liquidjs",
  "dompurify",
  "morphdom",
  "@codemirror/lang-liquid",
  "@codemirror/lint",
  "@codemirror/state",
  "@codemirror/view",
]

/** The only service overrides retained are Microsoft's existing TTS transport knobs. */
export function createExtensionClientEnvSchema() {
  return {
    WXT_EDGE_TTS_HTTP_ENABLED: rawBooleanSchema,
    WXT_EDGE_TTS_TRUSTED_CLIENT_TOKEN: z.string().min(1).optional(),
    WXT_EDGE_TTS_SIGNATURE_SECRET_BASE64: z.string().min(1).optional(),
    WXT_EDGE_TTS_SIGNATURE_APP_ID: z.string().min(1).optional(),
  }
}

export function resolveExtensionEnv(rawEnv: RawExtensionEnv) {
  return Object.fromEntries(
    Object.keys(createExtensionClientEnvSchema()).map((key) => [key, rawEnv[key]]),
  )
}
