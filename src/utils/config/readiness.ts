import type { Config } from "@/types/config/config"
import { sendMessage } from "@/utils/message"

let readiness: Promise<Config> | undefined
let localResolver: (() => Promise<Config>) | undefined

/** The background cannot send runtime messages to its own service worker. */
export function setBackgroundConfigReadyResolver(resolve: () => Promise<Config>) {
  localResolver = resolve
}

export function awaitConfigReady(retry = false): Promise<Config> {
  if (localResolver) return localResolver()
  if (!readiness || retry) {
    readiness = sendMessage("getInitialConfig", retry ? { retry: true } : undefined).then(
      (result) => {
        if (!result.ok) throw new Error(result.code)
        return result.config
      },
    )
  }
  return readiness
}

/** Recovery shell deliberately mounts no atoms, autosaving forms or default writers. */
export function showConfigRecovery(root: HTMLElement, error: unknown) {
  root.replaceChildren()
  const text = document.createElement("p")
  const code =
    error instanceof Error &&
    ["STORAGE_UNAVAILABLE", "UNSUPPORTED_SCHEMA", "MIGRATION_FAILED", "CLEANUP_FAILED"].includes(
      error.message,
    )
      ? error.message
      : "STORAGE_UNAVAILABLE"
  text.textContent = `Settings could not be initialized (${code}). Existing data has been retained.`
  root.append(text)
  if (location.pathname === "/options.html") {
    const retry = document.createElement("button")
    retry.textContent = "Retry initialization"
    retry.onclick = async () => {
      retry.disabled = true
      try {
        await awaitConfigReady(true)
        location.reload()
      } catch (nextError) {
        showConfigRecovery(root, nextError)
      }
    }
    root.append(retry)
  } else {
    const open = document.createElement("button")
    open.textContent = "Open settings"
    open.onclick = () => {
      void sendMessage("openOptionsPage", undefined)
    }
    root.append(open)
  }
}
