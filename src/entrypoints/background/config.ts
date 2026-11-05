import type { Config } from "@/types/config/config"
import { storage } from "#imports"
import { configSchema } from "@/types/config/config"
import { migrateConfig } from "@/utils/config/migration"
import { toPortableConfig } from "@/utils/config/portable"
import { buildFreshDefaultConfig, CONFIG_STORAGE_KEY } from "@/utils/constants/config"
import { initI18n } from "@/utils/i18n"
import { createConfigBootstrap } from "./config-bootstrap"
import { cleanupLegacyConfigStorage } from "./config-cleanup"
import {
  advanceBootstrapJournal,
  planLegacyCredentials,
  preserveLegacyCredentialsAndJournal,
  readBootstrapJournal,
} from "./openai-credentials"

const bootstrap = createConfigBootstrap<Config>({
  readConfig: () => storage.getItem<unknown>(`local:${CONFIG_STORAGE_KEY}`),
  readMeta: async () => {
    const meta = await storage.getMeta(`local:${CONFIG_STORAGE_KEY}`)
    return Object.keys(meta).length === 0 ? null : meta
  },
  readJournal: readBootstrapJournal,
  fresh: async () => {
    await initI18n("auto")
    return toPortableConfig(buildFreshDefaultConfig())
  },
  project: (raw, version) => migrateConfig(raw, version),
  validate: (raw) => configSchema.parse(raw),
  planCredentials: planLegacyCredentials,
  prepare: preserveLegacyCredentialsAndJournal,
  writeConfig: (config) => storage.setItem(`local:${CONFIG_STORAGE_KEY}`, config),
  writeMeta: (meta) => storage.setMeta(`local:${CONFIG_STORAGE_KEY}`, meta),
  advance: advanceBootstrapJournal,
  cleanup: cleanupLegacyConfigStorage,
})

export const getInitialConfig = (retry = false) => bootstrap.ensure(retry)

export async function ensureInitializedConfig(): Promise<Config> {
  const result = await getInitialConfig()
  if (!result.ok) throw new Error(`Configuration recovery required: ${result.code}`)
  return configSchema.parse(await storage.getItem<unknown>(`local:${CONFIG_STORAGE_KEY}`))
}
