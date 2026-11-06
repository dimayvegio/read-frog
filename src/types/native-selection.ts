export const MAX_NATIVE_SELECTION_LENGTH = 20_000
export const NATIVE_SELECTION_TTL_MS = 30 * 60 * 1000
export const NATIVE_SELECTION_STORAGE_PREFIX = "native-selection:"
export const NATIVE_PANEL_STORAGE_PREFIX = "native-panel:"

export interface NativeSelectionRequest {
  id: string
  text: string
  createdAt: number
  tooLong: boolean
  document?: { id: string; title: string }
}
