let active: { id: string; controller: AbortController } | null = null

export function beginTTSRequest(id: string) {
  if (!id || id.length > 256) throw new Error("Invalid speech request id")
  if (active?.id === id) return null
  const previousId = active?.id ?? null
  active?.controller.abort()
  active = { id, controller: new AbortController() }
  return previousId
}

export function cancelTTSRequest(id?: string) {
  if (active && (!id || active.id === id)) active.controller.abort()
}

export function canPlayTTSRequest(id: string): boolean {
  // Older content scripts may not claim a generation until reloaded.
  return !active || (active.id === id && !active.controller.signal.aborted)
}

export function getTTSRequestSignal(id: string): AbortSignal {
  if (active?.id !== id || active.controller.signal.aborted) {
    throw new DOMException("Speech request superseded", "AbortError")
  }
  return active.controller.signal
}
