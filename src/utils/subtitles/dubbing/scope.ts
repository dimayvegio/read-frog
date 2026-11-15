/** Config/profile snapshots are immutable atom/adapter values, not serialized tick payloads. */
export interface DubbingScope {
  id: unknown
  config: unknown
  context: string | undefined
  profile: unknown
}
export function sameDubbingScope(a: DubbingScope, b: DubbingScope) {
  return (
    a.id === b.id && a.config === b.config && a.context === b.context && a.profile === b.profile
  )
}
