import { sha256 } from "js-sha256"
import { browser, storage } from "#imports"
import { addBackup } from "@/utils/backup/storage"
import { toPortableConfig } from "@/utils/config/portable"
import { getLocalConfig } from "@/utils/config/storage"
import { EXTENSION_VERSION } from "@/utils/constants/app"
import { CONFIG_SCHEMA_VERSION, CONFIG_STORAGE_KEY } from "@/utils/constants/config"
import { onMessage } from "@/utils/message"
import {
  readSyncState,
  settingsSyncDB,
  type EdgeSyncState,
  type EdgeSyncView,
} from "@/utils/settings-sync/db"
import {
  SYNC_PREFIX,
  SYNC_BUDGET,
  MAX_DEVICES,
  canonical,
  contentHash,
  headKey,
  mergeClocks,
  packSettings,
  planSettingsSync,
  readHeader,
  readRestorableSettingsContent,
  unpackSettings,
  type SettingsContent,
  type SettingsSnapshot,
} from "@/utils/settings-sync/document"
import { isTrustedOptionsSender } from "./settings-sender"

const ALARM = "edge-settings-sync"
let active: Promise<void> | undefined,
  controller: AbortController | undefined,
  timer: ReturnType<typeof setTimeout> | undefined
async function currentContent(): Promise<SettingsContent> {
  const config = toPortableConfig(await getLocalConfig()),
    flags = await browser.storage.local.get("studyHighlightsEnabled")
  return { config, studyHighlightsEnabled: flags.studyHighlightsEnabled !== false }
}
export async function readEdgeCloud() {
  const values = await browser.storage.sync.get(null),
    snapshots: SettingsSnapshot[] = []
  const heads = Object.entries(values).filter(([key]) => key.startsWith(`${SYNC_PREFIX}head:`))
  if (heads.length > MAX_DEVICES) throw new Error("Kho đồng bộ có quá nhiều thiết bị.")
  for (const [key, value] of heads) {
    const header = readHeader(value, key),
      snapshot = await unpackSettings(header, values)
    if (!snapshot) return { values, snapshots: [], incomplete: true }
    snapshots.push(snapshot)
  }
  return { values, snapshots, incomplete: false }
}
const bytesIn = (values: Record<string, unknown>) =>
  Object.entries(values).reduce(
    (sum, [key, value]) => sum + new TextEncoder().encode(key + JSON.stringify(value)).length,
    0,
  )
const planToken = (state: EdgeSyncState, local: SettingsContent, rows: SettingsSnapshot[]) =>
  sha256(canonical([state.generation, contentHash(local), rows.map((row) => row.header.id).sort()]))
async function guard(state: EdgeSyncState, signal: AbortSignal) {
  signal.throwIfAborted()
  const latest = await readSyncState()
  if (!latest.enabled || latest.generation !== state.generation)
    throw new DOMException("Sync stopped", "AbortError")
}
async function assertLocal(expected: string) {
  if (contentHash(await currentContent()) !== expected)
    throw new Error("Cấu hình vừa thay đổi. Hãy tải lại và đồng bộ lần nữa.")
}
async function applyContent(
  state: EdgeSyncState,
  target: SettingsContent,
  expected: string,
  signal: AbortSignal,
) {
  const safe = readRestorableSettingsContent(target),
    before = await currentContent()
  if (contentHash(before) !== expected)
    throw new Error("Cấu hình vừa thay đổi. Hãy tải lại và đồng bộ lần nữa.")
  await addBackup(before.config, EXTENSION_VERSION)
  await guard(state, signal)
  await assertLocal(expected)
  await settingsSyncDB.state.update("main", { undo: before, pendingApply: true })
  // One storage-area write publishes both values together. Credentials and
  // other IndexedDB databases are never involved in the apply or its undo.
  await storage.setItems([
    { key: `local:${CONFIG_STORAGE_KEY}`, value: safe.config },
    { key: "local:studyHighlightsEnabled", value: safe.studyHighlightsEnabled },
  ])
  await storage.setMeta(`local:${CONFIG_STORAGE_KEY}`, {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    lastModifiedAt: Date.now(),
  })
  await guard(state, signal)
  await assertLocal(contentHash(safe))
  await settingsSyncDB.state.update("main", { pendingApply: false })
}
async function publish(
  state: EdgeSyncState,
  local: SettingsContent,
  snapshots: SettingsSnapshot[],
  values: Record<string, unknown>,
  signal: AbortSignal,
) {
  await guard(state, signal)
  const clocks = mergeClocks(...snapshots.map((row) => row.header.clock), state.baseClock ?? {})
  const counter = Math.max(state.counter, clocks[state.device] ?? 0) + 1
  clocks[state.device] = counter
  const packed = await packSettings(local, state.device, clocks)
  await settingsSyncDB.state.update("main", { counter }) // Reserve before asynchronous writes/restarts.
  await guard(state, signal)
  const ownPrefix = `${SYNC_PREFIX}data:${state.device}:`,
    oldHead = values[headKey(state.device)],
    keepId = oldHead ? readHeader(oldHead, headKey(state.device)).id : null
  const orphanKeys = Object.keys(values).filter(
    (key) => key.startsWith(ownPrefix) && !key.startsWith(`${ownPrefix}${keepId}:`),
  )
  if (orphanKeys.length) {
    await browser.storage.sync.remove(orphanKeys)
    for (const key of orphanKeys) delete values[key]
  }
  const staged = { ...values, ...packed.values, [headKey(state.device)]: packed.header }
  if (bytesIn(staged) > Math.min(SYNC_BUDGET, browser.storage.sync.QUOTA_BYTES ?? SYNC_BUDGET))
    throw new Error(
      "Kho đồng bộ Edge gần đầy. Cấu hình vẫn được giữ trên máy; hãy dùng xuất file hoặc giảm prompt/CSS tùy chỉnh.",
    )
  await guard(state, signal)
  await browser.storage.sync.set(packed.values)
  await guard(state, signal)
  // Head is the commit marker. Receiving a head before its chunks waits for
  // the next event; incomplete/corrupt snapshots never replace local settings.
  await browser.storage.sync.set({ [headKey(state.device)]: packed.header })
  const obsolete = Object.keys(values).filter(
    (key) => key.startsWith(ownPrefix) && !key.startsWith(`${ownPrefix}${packed.header.id}:`),
  )
  if (obsolete.length) await browser.storage.sync.remove(obsolete)
  await guard(state, signal)
  await settingsSyncDB.state.update("main", {
    baseHash: packed.header.contentHash,
    baseClock: packed.header.clock,
    lastPublishedAt: Date.now(),
  })
}
export async function runEdgeSettingsSync(resolution?: { token: string; source: string }) {
  if (active) return active
  controller = new AbortController()
  const signal = controller.signal
  active = (async () => {
    const state = await readSyncState()
    if (!state.enabled) return
    if (state.pendingApply) {
      await settingsSyncDB.state.update("main", {
        status: "recovery",
        message:
          "Lần áp dụng trước bị gián đoạn. Kiểm tra cấu hình hoặc khôi phục bản trước trước khi đồng bộ tiếp.",
      })
      return
    }
    await settingsSyncDB.state.update("main", {
      status: "busy",
      message: "Đang kiểm tra kho đồng bộ Edge…",
    })
    try {
      const local = await currentContent(),
        cloud = await readEdgeCloud()
      await guard(state, signal)
      if (cloud.incomplete) {
        await settingsSyncDB.state.update("main", {
          status: "waiting",
          message: "Đang chờ Edge tải đủ các phần của cấu hình. Chưa thay đổi dữ liệu trên máy.",
        })
        return
      }
      const plan = planSettingsSync(cloud.snapshots, local, state.baseHash, state.baseClock),
        expected = contentHash(local)
      if (resolution) {
        if (resolution.token !== planToken(state, local, cloud.snapshots))
          throw new Error("Cấu hình vừa thay đổi. Hãy tải lại và đồng bộ lần nữa.")
        const target =
          resolution.source === "local"
            ? local
            : cloud.snapshots.find((row) => row.header.id === resolution.source)?.content
        if (!target) throw new Error("Bản cấu hình đã thay đổi. Hãy tải lại.")
        await assertLocal(expected)
        await publish(state, target, cloud.snapshots, cloud.values, signal)
        if (contentHash(target) !== expected) await applyContent(state, target, expected, signal)
      } else if (plan.action === "conflict") {
        await settingsSyncDB.state.update("main", {
          status: "conflict",
          message: "Có cấu hình khác nhau. Chọn bản muốn dùng; chưa ghi đè bên nào.",
        })
        return
      } else if (plan.action === "push") {
        if (state.lastPublishedAt && Date.now() - state.lastPublishedAt < 15000) {
          await settingsSyncDB.state.update("main", {
            status: "ready",
            message: "Đang gộp thay đổi cấu hình; sẽ gửi trong lần đồng bộ tiếp theo.",
          })
          return
        }
        await assertLocal(expected)
        await publish(state, local, cloud.snapshots, cloud.values, signal)
      } else {
        if (plan.action === "pull")
          await applyContent(state, plan.incoming.content, expected, signal)
        await guard(state, signal)
        await settingsSyncDB.state.update("main", {
          baseHash: contentHash(plan.incoming.content),
          baseClock: mergeClocks(...plan.heads.map((row) => row.header.clock)),
        })
      }
      await guard(state, signal)
      await settingsSyncDB.state.update("main", {
        status: "synced",
        lastSync: Date.now(),
        message:
          "Đã cập nhật kho cấu hình Edge. Việc chuyển sang máy khác do đồng bộ tài khoản Edge thực hiện.",
      })
    } catch (error) {
      if (signal.aborted) return
      const latest = await readSyncState()
      const known =
        error instanceof Error &&
        /^(Cấu hình |Kho đồng bộ |Bản cấu hình |Bản đồng bộ |Nội dung đồng bộ |Khối cấu hình )/.test(
          error.message,
        )
      await settingsSyncDB.state.update("main", {
        status: latest.pendingApply ? "recovery" : "error",
        message: known
          ? error.message
          : "Chưa đồng bộ được. Kiểm tra phiên bản extension, dung lượng và đồng bộ tài khoản Edge rồi thử lại. Cấu hình hiện tại vẫn được giữ.",
      })
    }
  })().finally(() => {
    active = undefined
    controller = undefined
  })
  return active
}
const summary = (content: SettingsContent) => ({
  model: content.config.providersConfig[0]?.model.model ?? "",
  targetLanguage: content.config.language.targetCode,
  uiLanguage: content.config.uiLanguage,
  studyHighlightsEnabled: content.studyHighlightsEnabled,
})
export async function edgeSyncStatus(): Promise<EdgeSyncView> {
  const state = await readSyncState(),
    local = await currentContent()
  try {
    const cloud = await readEdgeCloud(),
      plan = planSettingsSync(cloud.snapshots, local, state.baseHash, state.baseClock)
    return {
      enabled: state.enabled,
      status: active ? "busy" : state.status,
      message: state.message,
      device: state.device,
      extensionId: browser.runtime.id,
      lastSync: state.lastSync ?? null,
      canUndo: !!state.undo,
      pendingApply: !!state.pendingApply,
      local: summary(local),
      localConfiguration: local.config,
      token: planToken(state, local, cloud.snapshots),
      incomplete: cloud.incomplete,
      bytes: bytesIn(cloud.values),
      candidates: plan.heads.map((row) => ({
        id: row.header.id,
        device: row.header.device,
        at: row.header.at,
        configuration: row.content.config,
        ...summary(row.content),
      })),
    }
  } catch {
    return {
      enabled: state.enabled,
      status: "error",
      message: "Chưa đọc được bản cấu hình trong kho Edge; chưa thay đổi dữ liệu.",
      device: state.device,
      extensionId: browser.runtime.id,
      lastSync: state.lastSync ?? null,
      canUndo: !!state.undo,
      pendingApply: !!state.pendingApply,
      local: summary(local),
      localConfiguration: local.config,
      token: "",
      incomplete: true,
      bytes: 0,
      candidates: [],
    }
  }
}
async function stopRun() {
  clearTimeout(timer)
  controller?.abort()
  await active
}
function schedule() {
  clearTimeout(timer)
  timer = setTimeout(() => void runEdgeSettingsSync().catch(() => {}), 5000)
}
export function setupSettingsSyncHandlers() {
  const requirePage = (sender: Parameters<typeof isTrustedOptionsSender>[0]) => {
    if (
      !isTrustedOptionsSender(
        sender,
        browser.runtime.id,
        browser.runtime.getURL("/settings-sync.html"),
      )
    )
      throw new Error("Open settings sync")
  }
  onMessage("openSettingsSync", async () => {
    await browser.tabs.create({ url: browser.runtime.getURL("/settings-sync.html"), active: true })
  })
  onMessage("getEdgeSettingsSync", async (message) => {
    requirePage(message.sender)
    return edgeSyncStatus()
  })
  onMessage("setEdgeSettingsSyncEnabled", async (message) => {
    requirePage(message.sender)
    if (typeof message.data.enabled !== "boolean") throw new Error("Invalid setting")
    await stopRun()
    const state = await readSyncState()
    await settingsSyncDB.state.update("main", {
      enabled: message.data.enabled,
      generation: state.generation + 1,
      status: message.data.enabled ? "ready" : "off",
      message: message.data.enabled
        ? "Đã bật. Đang kiểm tra cấu hình…"
        : "Đã tắt đồng bộ trên máy này. Bản trong kho Edge vẫn được giữ.",
    })
    if (message.data.enabled) {
      await browser.alarms.create(ALARM, { periodInMinutes: 1 })
      await runEdgeSettingsSync()
    } else await browser.alarms.clear(ALARM)
    return edgeSyncStatus()
  })
  onMessage("syncEdgeSettingsNow", async (message) => {
    requirePage(message.sender)
    await runEdgeSettingsSync(message.data)
    return edgeSyncStatus()
  })
  onMessage("undoEdgeSettingsSync", async (message) => {
    requirePage(message.sender)
    await stopRun()
    const state = await readSyncState()
    if (!state.undo) throw new Error("No previous settings")
    const previous = state.undo,
      current = await currentContent()
    await settingsSyncDB.state.update("main", {
      enabled: false,
      generation: state.generation + 1,
      pendingApply: true,
      status: "busy",
    })
    await browser.alarms.clear(ALARM)
    try {
      await addBackup(current.config, EXTENSION_VERSION)
      await storage.setItems([
        { key: `local:${CONFIG_STORAGE_KEY}`, value: previous.config },
        { key: "local:studyHighlightsEnabled", value: previous.studyHighlightsEnabled },
      ])
      await storage.setMeta(`local:${CONFIG_STORAGE_KEY}`, {
        schemaVersion: CONFIG_SCHEMA_VERSION,
        lastModifiedAt: Date.now(),
      })
    } catch {
      await settingsSyncDB.state.update("main", {
        status: "recovery",
        message:
          "Khôi phục bị gián đoạn. Đồng bộ đã tắt; có thể thử khôi phục lại hoặc giữ cấu hình hiện tại.",
      })
      return edgeSyncStatus()
    }
    await settingsSyncDB.state.update("main", {
      enabled: false,
      generation: state.generation + 1,
      baseHash: undefined,
      baseClock: undefined,
      pendingApply: false,
      undo: undefined,
      status: "off",
      message: "Đã khôi phục cấu hình trước lần nhận đồng bộ và tắt tự đồng bộ trên máy này.",
    })
    await browser.alarms.clear(ALARM)
    return edgeSyncStatus()
  })
  onMessage("acknowledgeEdgeSyncRecovery", async (message) => {
    requirePage(message.sender)
    await stopRun()
    const state = await readSyncState()
    await settingsSyncDB.state.update("main", {
      enabled: false,
      generation: state.generation + 1,
      pendingApply: false,
      baseHash: undefined,
      baseClock: undefined,
      status: "off",
      message:
        "Đã giữ cấu hình hiện tại và tắt đồng bộ. Có thể bật lại để kiểm tra các bản trong kho Edge.",
    })
    await browser.alarms.clear(ALARM)
    return edgeSyncStatus()
  })
  onMessage("openEdgeSyncSettings", async (message) => {
    requirePage(message.sender)
    await browser.tabs.create({
      url: navigator.userAgent.includes("Edg/")
        ? "edge://settings/profiles/sync"
        : "chrome://settings/syncSetup",
      active: true,
    })
  })
  browser.storage.onChanged.addListener((changes, area) => {
    if (
      (area === "sync" && Object.keys(changes).some((key) => key.startsWith(SYNC_PREFIX))) ||
      (area === "local" && (CONFIG_STORAGE_KEY in changes || "studyHighlightsEnabled" in changes))
    )
      schedule()
  })
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void runEdgeSettingsSync().catch(() => {})
  })
  void (async () => {
    await browser.storage.sync.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" })
  })().catch(() => {})
  void readSyncState()
    .then(async (state) => {
      if (state.enabled) {
        await browser.alarms.create(ALARM, { periodInMinutes: 1 })
        schedule()
      }
    })
    .catch(() => {})
}
