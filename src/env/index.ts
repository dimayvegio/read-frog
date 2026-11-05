import { z } from "zod"
import { createExtensionClientEnvSchema, resolveExtensionEnv } from "./shared"

export const env = z
  .object(createExtensionClientEnvSchema())
  .parse(resolveExtensionEnv(import.meta.env))
