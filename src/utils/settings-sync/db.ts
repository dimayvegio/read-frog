import type { SettingsContent, SyncClock } from "./document"
import type { Config } from "@/types/config/config"
import { Dexie, type Table } from "dexie"
import { getRandomUUID } from "@/utils/crypto-polyfill"
export interface EdgeSyncState {
  id: "main"
  device: string
  enabled: boolean
  generation: number
  counter: number
  baseHash?: string
  baseClock?: SyncClock
  lastPublishedAt?: number
  lastSync?: number
  status: "off" | "ready" | "busy" | "synced" | "waiting" | "conflict" | "error" | "recovery"
  message: string
  undo?: SettingsContent
  pendingApply?: boolean
}
export interface SettingsSummary {
  model: string
  targetLanguage: string
  uiLanguage: string
  studyHighlightsEnabled: boolean
}
export interface EdgeSyncView {
  enabled: boolean
  status: string
  message: string
  device: string
  extensionId: string
  lastSync: number | null
  canUndo: boolean
  pendingApply: boolean
  local: SettingsSummary
  localConfiguration: Config
  token: string
  incomplete: boolean
  bytes: number
  candidates: (SettingsSummary & {
    id: string
    device: string
    at: number
    configuration: Config
  })[]
}
export class SettingsSyncDatabase extends Dexie {
  state!: Table<EdgeSyncState, string>
  constructor(name = "read-frog-settings-sync") {
    super(name)
    this.version(1).stores({ state: "&id" })
  }
}
export const settingsSyncDB = new SettingsSyncDatabase()
export async function readSyncState(): Promise<EdgeSyncState> {
  let state = await settingsSyncDB.state.get("main")
  if (!state) {
    const initial: EdgeSyncState = {
      id: "main",
      device: getRandomUUID(),
      enabled: false,
      generation: 0,
      counter: 0,
      status: "off",
      message: "Chưa bật đồng bộ cấu hình Edge.",
    }
    await settingsSyncDB.state.add(initial).catch(() => {})
    state = (await settingsSyncDB.state.get("main"))!
  }
  return state
}
