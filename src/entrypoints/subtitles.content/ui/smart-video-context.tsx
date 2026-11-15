import type { SmartProfile } from "@/utils/subtitles/dubbing/smart"
import { createContext, use } from "react"
export interface SmartVideoUI {
  enabled: boolean
  busy: boolean
  profile: SmartProfile | null
  status: string
  setEnabled: (value: boolean) => void
  chooseFile: (file: File | null) => void
  prepare: () => Promise<boolean>
  cancel: () => void
}
export const SmartVideoContext = createContext<SmartVideoUI | null>(null)
export function useSmartVideo() {
  return use(SmartVideoContext)
}
