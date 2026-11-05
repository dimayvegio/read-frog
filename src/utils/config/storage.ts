import type { Config } from "@/types/config/config"
import type { ConfigMeta, ConfigValueAndMeta } from "@/types/config/meta"
import { storage } from "#imports"
import { configSchema } from "@/types/config/config"
import { CONFIG_SCHEMA_VERSION, CONFIG_STORAGE_KEY } from "../constants/config"
import { logger } from "../logger"
import { awaitConfigReady } from "./readiness"

export async function getLocalConfig() {
  await awaitConfigReady()
  const config = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  if (!config) {
    throw new Error("Local configuration is unavailable")
  }
  const parsedConfig = configSchema.safeParse(config)
  if (!parsedConfig.success) {
    throw new Error("Local configuration requires recovery")
  }
  return parsedConfig.data
}

export async function setLocalConfig(config: Config) {
  await awaitConfigReady()
  const parsedConfig = configSchema.safeParse(config)
  if (!parsedConfig.success) {
    throw new Error("Config is invalid")
  }
  await storage.setItem<Config>(`local:${CONFIG_STORAGE_KEY}`, parsedConfig.data)
  await storage.setMeta<Partial<ConfigMeta>>(`local:${CONFIG_STORAGE_KEY}`, {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    lastModifiedAt: Date.now(),
  })
}

export async function getLocalConfigAndMeta(): Promise<ConfigValueAndMeta> {
  await awaitConfigReady()
  try {
    const [config, meta] = await Promise.all([
      storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`),
      storage.getMeta<ConfigMeta>(`local:${CONFIG_STORAGE_KEY}`),
    ])

    if (!config) {
      throw new Error("Local config not found")
    }

    const parsedConfig = configSchema.safeParse(config)
    if (!parsedConfig.success) {
      throw new Error("Local config is invalid")
    }

    return {
      value: parsedConfig.data,
      meta: {
        schemaVersion: meta?.schemaVersion ?? CONFIG_SCHEMA_VERSION,
        lastModifiedAt: meta?.lastModifiedAt ?? Date.now(),
      },
    }
  } catch (error) {
    logger.error("Failed to get local config", error)
    throw error
  }
}

export async function setLocalConfigAndMeta(config: Config, meta: Partial<ConfigMeta>) {
  await awaitConfigReady()
  const lastModifiedAt = meta.lastModifiedAt ?? Date.now()
  const parsedConfig = configSchema.safeParse(config)
  if (!parsedConfig.success) {
    throw new Error("Config is invalid")
  }
  await storage.setItem<Config>(`local:${CONFIG_STORAGE_KEY}`, parsedConfig.data)
  await storage.setMeta<Partial<ConfigMeta>>(`local:${CONFIG_STORAGE_KEY}`, {
    ...meta,
    schemaVersion: CONFIG_SCHEMA_VERSION,
    lastModifiedAt,
  })
}
