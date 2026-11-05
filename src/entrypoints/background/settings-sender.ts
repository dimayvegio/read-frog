export interface SettingsSender {
  id?: string
  url?: string
  frameId?: number
}

export function isTrustedOptionsSender(
  sender: SettingsSender | undefined,
  runtimeId: string,
  optionsURL: string,
): boolean {
  if (
    !sender ||
    sender.id !== runtimeId ||
    !sender.url ||
    (sender.frameId !== undefined && sender.frameId !== 0)
  )
    return false
  try {
    const actual = new URL(sender.url)
    const expected = new URL(optionsURL)
    return (
      actual.protocol === expected.protocol &&
      actual.host === expected.host &&
      actual.pathname === expected.pathname &&
      !actual.username &&
      !actual.password
    )
  } catch {
    return false
  }
}
