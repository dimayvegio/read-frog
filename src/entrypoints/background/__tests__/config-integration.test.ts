import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { testSeries } from "@/utils/config/__tests__/example/v120"
import { CONFIG_SCHEMA_VERSION, DEFAULT_CONFIG } from "@/utils/constants/config"
import "fake-indexeddb/auto"

const deleteCloudBase = vi.hoisted(() => vi.fn<(...args: any[]) => any>(async (_key: string) => {}))
vi.mock("@/utils/db/dexie/db", () => ({
  db: { glossarySyncSnapshot: { delete: deleteCloudBase } },
}))

beforeEach(async () => {
  vi.resetModules()
  await fakeBrowser.storage.local.clear()
  await fakeBrowser.storage.session.clear()
  vi.spyOn(fakeBrowser.runtime, "setUninstallURL").mockResolvedValue(undefined)
  deleteCloudBase.mockClear()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("edge-openai-credentials")
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error("Unable to reset test credentials"))
  })
})

describe("production configuration bootstrap and cleanup wiring", () => {
  it.each([
    [121, "active"],
    [121, "deleted"],
    [122, "active"],
    [122, "deleted"],
    [123, "active"],
    [123, "deleted"],
  ] as const)(
    "upgrades an installed v%i profile without changing its %s credential",
    async (version, state) => {
      const { testSeries: previousSeries } =
        version === 121
          ? await import("@/utils/config/__tests__/example/v121")
          : version === 122
            ? await import("@/utils/config/__tests__/example/v122")
            : await import("@/utils/config/__tests__/example/v123")
      const previous = structuredClone(Object.values(previousSeries)[0]!.config)
      previous.videoSubtitles.autoStart.youtube = true
      if (version >= 122) {
        previous.tts.provider = "openai"
        previous.tts.openai = {
          model: "gpt-4o-mini-tts",
          voice: "coral",
          speed: 1.25,
          instructions: "Warm.",
        }
      }
      await storage.setItem("local:config", previous)
      await storage.setMeta("local:config", { schemaVersion: version })
      const credentials = await import("../openai-credentials")
      if (state === "active") await credentials.saveOpenAIKey("existing-private-sentinel")
      else await credentials.deleteOpenAIKey()
      const status = await credentials.readOpenAIKeyStatus()
      const { ensureInitializedConfig } = await import("../config")
      const config = await ensureInitializedConfig()
      expect(config.tts).toMatchObject({
        ...previous.tts,
        provider: version === 121 ? "microsoft" : "openai",
      })
      expect(config.tts.openai.model).toBe(
        version === 121 ? "gpt-realtime-2.1-mini" : "gpt-4o-mini-tts",
      )
      expect(config.videoSubtitles.autoStart).toMatchObject({
        youtube: true,
        bilibili: false,
        udemy: false,
        edx: false,
        anipm: false,
      })
      expect(await credentials.readOpenAIKeyStatus()).toMatchObject({
        configured: state === "active",
        revision: status.revision,
      })
      expect((await credentials.readBootstrapJournal())?.targetVersion).toBe(CONFIG_SCHEMA_VERSION)
      expect((await storage.getMeta("local:config")).schemaVersion).toBe(CONFIG_SCHEMA_VERSION)
    },
  )

  it("migrates installed credentials before publishing canonical config; sanitizes indexed and orphan backups", async () => {
    const legacy = structuredClone(Object.values(testSeries)[0]!.config)
    legacy.providersConfig = [
      { ...DEFAULT_CONFIG.providersConfig[0], apiKey: "installed-sentinel" },
    ]
    legacy.pageTranslation.providerId = "openai-default"
    await storage.setItem("local:config", legacy)
    await storage.setMeta("local:config", { schemaVersion: 120, lastModifiedAt: 7 })
    for (const id of ["configBackup_indexed", "configBackup_orphan"]) {
      await storage.setItem(`local:${id}`, {
        schemaVersion: 120,
        config: {
          ...legacy,
          providersConfig: [{ ...legacy.providersConfig[0], apiKey: "backup-sentinel" }],
        },
      })
    }
    await storage.setItem("local:configBackup_unreadable", {
      schemaVersion: 999,
      config: { apiKey: "recovery-sentinel" },
    })
    await storage.setItem("local:backup_ids", ["configBackup_indexed"])
    await storage.setItem("local:lastSyncedConfig", { apiKey: "cloud-sentinel" })
    await storage.setItem("local:unrelated-local-preference", "keep")
    const { getInitialConfig, ensureInitializedConfig } = await import("../config")
    const result = await getInitialConfig()
    expect(result.ok).toBe(true)
    expect(await ensureInitializedConfig()).toMatchObject({
      providersConfig: [{ id: "openai-default" }],
      tts: legacy.tts,
    })
    expect((await storage.getMeta("local:config")).schemaVersion).toBe(CONFIG_SCHEMA_VERSION)
    const credentials = await import("../openai-credentials")
    expect(await credentials.readOpenAIKey()).toBe("installed-sentinel")
    expect(await credentials.readOpenAIKeyStatus()).toMatchObject({ recoveryBackupCount: 1 })
    const publicStorage = await fakeBrowser.storage.local.get(null)
    for (const secret of [
      "installed-sentinel",
      "backup-sentinel",
      "recovery-sentinel",
      "cloud-sentinel",
    ])
      expect(JSON.stringify(publicStorage)).not.toContain(secret)
    expect(await storage.getItem("local:backup_ids")).toEqual([
      "configBackup_indexed",
      "configBackup_orphan",
    ])
    expect(await storage.getItem("local:unrelated-local-preference")).toBe("keep")
    expect(deleteCloudBase.mock.calls).toEqual([["base"]])
    expect(fakeBrowser.runtime.setUninstallURL).toHaveBeenCalledWith("")
  })

  it("initializes a genuinely fresh profile without a bundled key", async () => {
    const { getInitialConfig } = await import("../config")
    expect(await getInitialConfig()).toMatchObject({
      ok: true,
      schemaVersion: CONFIG_SCHEMA_VERSION,
    })
    expect(await (await import("../openai-credentials")).readOpenAIKeyStatus()).toMatchObject({
      configured: false,
      requiresReentry: false,
    })
  })

  it("refuses a future config without changing public config, metadata or service state", async () => {
    await storage.setItem("local:config", { apiKey: "future-sentinel", untouched: true })
    await storage.setMeta("local:config", { schemaVersion: CONFIG_SCHEMA_VERSION + 1 })
    await storage.setItem("local:lastSyncedConfig", "keep-until-supported")
    const before = await fakeBrowser.storage.local.get(null)
    const { getInitialConfig } = await import("../config")
    expect(await getInitialConfig()).toEqual({
      ok: false,
      code: "UNSUPPORTED_SCHEMA",
      retryable: false,
    })
    expect(await fakeBrowser.storage.local.get(null)).toEqual(before)
    expect(deleteCloudBase).not.toHaveBeenCalled()
  })
})
