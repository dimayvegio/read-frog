import type { DubbingState } from "@/utils/subtitles/dubbing/controller"
import type { DubbingMode } from "@/utils/subtitles/dubbing/cues"
import { createContext, use } from "react"
export interface DubbingUI {
  state: DubbingState
  mode: DubbingMode
  volume: number
  offsetMs: number
  duck: number
  model: string
  voice: string
  changeMode: (mode: DubbingMode) => void
  changeVolume: (value: number) => void
  changeOffset: (value: number) => void
  changeDuck: (duck: number) => void
  start: () => void
  stop: () => void
}
export const DubbingContext = createContext<DubbingUI | null>(null)
export function useDubbing() {
  return use(DubbingContext)
}
