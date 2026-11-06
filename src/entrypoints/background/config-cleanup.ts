import { browser, storage } from "#imports"
import { migrateConfig } from "@/utils/config/migration"
import { CONFIG_SCHEMA_VERSION } from "@/utils/constants/config"
import { db } from "@/utils/db/dexie/db"
import { preserveRecoveryBackup } from "./openai-credentials"

/** Own namespaces only; preserve unreadable snapshots privately before removal. */
export async function cleanupLegacyConfigStorage() {
  const values = await browser.storage.local.get(null)
  const indexed = Array.isArray(values.backup_ids)
    ? values.backup_ids.filter(
        (id): id is string => typeof id === "string" && id.startsWith("configBackup_"),
      )
    : []
  const ids = [
    ...new Set([
      ...indexed,
      ...Object.keys(values).filter((key) => key.startsWith("configBackup_") && !key.endsWith("$")),
    ]),
  ]
  const retained: string[] = []
  for (const id of ids) {
    const value = await storage.getItem<unknown>(`local:${id}`)
    if (value === null) continue
    const metadata = await storage.getMeta(`local:${id}`)
    let publicBackup: { schemaVersion: number; config: unknown } | undefined
    try {
      if (
        !value ||
        typeof value !== "object" ||
        !("config" in value) ||
        !("schemaVersion" in value) ||
        typeof value.schemaVersion !== "number"
      )
        throw new Error("Invalid backup")
      publicBackup = {
        schemaVersion: CONFIG_SCHEMA_VERSION,
        config: await migrateConfig(value.config, value.schemaVersion),
      }
    } catch {
      await preserveRecoveryBackup(id, { value, metadata })
      await storage.removeItem(`local:${id}`, { removeMeta: true })
      continue
    }
    await storage.setItem(`local:${id}`, publicBackup)
    await storage.setMeta(`local:${id}`, metadata)
    retained.push(id)
  }
  await storage.setItem("local:backup_ids", retained)
  await storage.removeItems(
    [
      "lastSyncedConfig",
      "__googleDriveToken",
      "notebasePendingSave",
      "analyticsEnabled",
      "analyticsInstallId",
      "installedAt",
    ].map((key) => ({ key: `local:${key}` as const, options: { removeMeta: true } })),
  )
  await storage.removeItem("session:hostedAiStatus", { removeMeta: true })
  // Keep the table and import Undo. Only the retired cloud merge base is removed.
  await db.glossarySyncSnapshot.delete("base")
  await browser.runtime.setUninstallURL("")
}
