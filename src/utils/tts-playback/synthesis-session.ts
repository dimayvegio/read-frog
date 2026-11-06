let active: { id: string; controller: AbortController } | null = null

/** Shared by read-aloud controls in this JS context. Playback itself is global
 * through the existing background/offscreen request-id ownership protocol. */
export function claimSpeechSynthesis(id: string, controller: AbortController) {
  active?.controller.abort()
  active = { id, controller }
}
export function releaseSpeechSynthesis(id: string | null) {
  if (active?.id === id) active = null
}
export function ownsSpeechSynthesis(id: string): boolean {
  return active?.id === id
}
