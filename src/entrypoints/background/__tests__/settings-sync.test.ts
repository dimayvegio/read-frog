import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { browser, storage } from "#imports"
import { toPortableConfig } from "@/utils/config/portable"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { settingsSyncDB, readSyncState } from "@/utils/settings-sync/db"
import { headKey, packSettings, type SettingsContent } from "@/utils/settings-sync/document"
import { edgeSyncStatus, runEdgeSettingsSync, setupSettingsSyncHandlers } from "../settings-sync"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
type Handler = (message: { data?: any; sender: Record<string, unknown> }) => Promise<any>
const handlers = vi.hoisted(() => new Map<string, Handler>())
vi.mock("@/utils/message", () => ({
  onMessage: (name: string, handler: Handler) => handlers.set(name, handler),
}))
const remote = "22222222-2222-4222-8222-222222222222"
const content = (): SettingsContent => ({
  config: toPortableConfig(DEFAULT_CONFIG),
  studyHighlightsEnabled: true,
})
const sender = () => ({
  id: browser.runtime.id,
  url: browser.runtime.getURL("/settings-sync.html"),
  frameId: 0,
})
const call = (name: string, data?: unknown) => handlers.get(name)!({ sender: sender(), data })
async function addRemote(value: SettingsContent, clock: Record<string, number>) {
  const packed = await packSettings(value, remote, clock)
  await browser.storage.sync.set({ ...packed.values, [headKey(remote)]: packed.header })
  return packed
}
beforeEach(async () => {
  fakeBrowser.reset()
  vi.spyOn(browser.storage.sync, "setAccessLevel").mockResolvedValue()
  handlers.clear()
  await settingsSyncDB.state.clear()
  await browser.storage.local.set({
    config: content().config,
    studyHighlightsEnabled: true,
    privateSentinel: "private-device-key",
  })
  setupSettingsSyncHandlers()
  await readSyncState()
})
afterEach(async () => {
  await call("setEdgeSettingsSyncEnabled", { enabled: false })
  vi.restoreAllMocks()
})
describe("Edge settings synchronization boundaries", () => {
  it("starts off and refuses site/frame messages before reading synced data", async () => {
    const spy = vi.spyOn(browser.storage.sync, "get")
    await expect(
      handlers.get("getEdgeSettingsSync")!({
        sender: { ...sender(), url: "https://example.com/settings-sync.html" },
      }),
    ).rejects.toThrow("Open settings sync")
    await expect(
      handlers.get("getEdgeSettingsSync")!({ sender: { ...sender(), frameId: 2 } }),
    ).rejects.toThrow("Open settings sync")
    expect(spy).not.toHaveBeenCalled()
    expect((await readSyncState()).enabled).toBe(false)
  })
  it("publishes only approved portable config and retains unrelated local data", async () => {
    await call("setEdgeSettingsSyncEnabled", { enabled: true })
    const cloud = await browser.storage.sync.get(null)
    expect(Object.keys(cloud).some((key) => key.startsWith("rf-config:head:"))).toBe(true)
    expect(JSON.stringify(cloud)).not.toMatch(/private-device-key|apiKey|audioBase64/)
    expect((await browser.storage.local.get("privateSentinel")).privateSentinel).toBe(
      "private-device-key",
    )
    expect((await readSyncState()).baseHash).toBeTruthy()
  })
  it("backs up before applying a causal remote change and can undo without deleting cloud data", async () => {
    await call("setEdgeSettingsSyncEnabled", { enabled: true })
    const state = await readSyncState()
    await addRemote(
      { ...content(), studyHighlightsEnabled: false },
      { ...state.baseClock, [remote]: 1 },
    )
    await runEdgeSettingsSync()
    expect((await browser.storage.local.get("studyHighlightsEnabled")).studyHighlightsEnabled).toBe(
      false,
    )
    expect((await readSyncState()).undo!.studyHighlightsEnabled).toBe(true)
    const cloudBefore = await browser.storage.sync.get(null)
    await call("undoEdgeSettingsSync")
    expect((await browser.storage.local.get("studyHighlightsEnabled")).studyHighlightsEnabled).toBe(
      true,
    )
    expect((await readSyncState()).enabled).toBe(false)
    expect(await browser.storage.sync.get(null)).toEqual(cloudBefore)
    const backups = (await browser.storage.local.get("backup_ids")).backup_ids
    expect(Array.isArray(backups) && backups.length > 0).toBe(true)
  })
  it("requires a first-pairing choice and rejects a choice made against stale remote data", async () => {
    const first = await addRemote({ ...content(), studyHighlightsEnabled: false }, { [remote]: 1 })
    const status = await call("setEdgeSettingsSyncEnabled", { enabled: true })
    expect(status.status).toBe("conflict")
    expect((await browser.storage.local.get("studyHighlightsEnabled")).studyHighlightsEnabled).toBe(
      true,
    )
    await addRemote({ ...content(), studyHighlightsEnabled: false }, { [remote]: 2 })
    await call("syncEdgeSettingsNow", { token: status.token, source: first.header.id })
    expect((await readSyncState()).status).toBe("error")
    expect((await browser.storage.local.get("studyHighlightsEnabled")).studyHighlightsEnabled).toBe(
      true,
    )
  })
  it("resolves concurrent branches explicitly and does not erase another device's payload", async () => {
    await call("setEdgeSettingsSyncEnabled", { enabled: true })
    const state = await readSyncState(),
      value = content()
    value.config.uiLanguage = "vi"
    await browser.storage.local.set({ config: value.config })
    const other = await addRemote(
      { ...content(), studyHighlightsEnabled: false },
      { ...state.baseClock, [remote]: 1 },
    )
    await runEdgeSettingsSync()
    const status = await edgeSyncStatus()
    expect(status.status).toBe("conflict")
    await call("syncEdgeSettingsNow", { token: status.token, source: "local" })
    const after = await edgeSyncStatus()
    expect(after.status).toBe("synced")
    expect(after.candidates).toHaveLength(1)
    expect(after.local.uiLanguage).toBe("vi")
    const cloud = await browser.storage.sync.get(null)
    expect(cloud[headKey(remote)]).toEqual(other.header)
    expect(Object.keys(other.values).every((key) => cloud[key] === other.values[key])).toBe(true)
  })
  it("waits for head-before-chunks delivery without writing a replacement snapshot", async () => {
    const packed = await packSettings({ ...content(), studyHighlightsEnabled: false }, remote, {
      [remote]: 1,
    })
    await browser.storage.sync.set({ [headKey(remote)]: packed.header })
    await call("setEdgeSettingsSyncEnabled", { enabled: true })
    expect((await readSyncState()).status).toBe("waiting")
    expect(Object.keys(await browser.storage.sync.get(null))).toEqual([headKey(remote)])
    expect((await browser.storage.local.get("studyHighlightsEnabled")).studyHighlightsEnabled).toBe(
      true,
    )
  })
  it("refuses a full sync store before staging a new head and preserves local config", async () => {
    const filler = Object.fromEntries(
      Array.from({ length: 15 }, (_, n) => [`existing-${n}`, "x".repeat(6000)]),
    )
    await browser.storage.sync.set(filler)
    await call("setEdgeSettingsSyncEnabled", { enabled: true })
    expect((await readSyncState()).status).toBe("error")
    expect(await browser.storage.sync.get(null)).toEqual(filler)
    expect((await browser.storage.local.get("config")).config).toEqual(content().config)
  })
  it("keeps the previous committed head when staging fails", async () => {
    await call("setEdgeSettingsSyncEnabled", { enabled: true })
    const cloudBefore = await browser.storage.sync.get(null)
    await settingsSyncDB.state.update("main", { lastPublishedAt: 0 })
    await browser.storage.local.set({ studyHighlightsEnabled: false })
    vi.spyOn(browser.storage.sync, "set").mockRejectedValueOnce(new Error("quota failure"))
    await runEdgeSettingsSync()
    expect((await readSyncState()).status).toBe("error")
    expect(await browser.storage.sync.get(null)).toEqual(cloudBefore)
    expect((await browser.storage.local.get("studyHighlightsEnabled")).studyHighlightsEnabled).toBe(
      false,
    )
  })
  it("keeps a persistent recovery journal if applying settings is interrupted", async () => {
    await call("setEdgeSettingsSyncEnabled", { enabled: true })
    const state = await readSyncState()
    await addRemote(
      { ...content(), studyHighlightsEnabled: false },
      { ...state.baseClock, [remote]: 1 },
    )
    const original = storage.setMeta.bind(storage)
    vi.spyOn(storage, "setMeta").mockImplementation(async (key, meta) => {
      if (key === "local:config") throw new Error("Metadata unavailable")
      return original(key, meta)
    })
    await runEdgeSettingsSync()
    expect(await readSyncState()).toMatchObject({ status: "recovery", pendingApply: true })
    const before = await browser.storage.sync.get(null)
    await runEdgeSettingsSync()
    expect(await browser.storage.sync.get(null)).toEqual(before)
    await call("acknowledgeEdgeSyncRecovery")
    expect(await readSyncState()).toMatchObject({ enabled: false, pendingApply: false })
    expect((await browser.storage.local.get("studyHighlightsEnabled")).studyHighlightsEnabled).toBe(
      false,
    )
  })
})
