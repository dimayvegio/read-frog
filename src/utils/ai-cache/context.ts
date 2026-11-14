import type { AiCacheKind } from "./db"
import type { Config } from "@/types/config/config"
import { liveQuery } from "dexie"
import { browser } from "#imports"
import { getLocalConfig } from "@/utils/config/storage"
import { sendMessage } from "@/utils/message"
import { resolveProviderRefForCapability } from "@/utils/providers/provider-registry"
import { getPdfHistoryEpoch } from "@/utils/selection-result/pdf-history"
import { aiCacheEpoch, aiCacheKey } from "./db"

const configIdentity = (config: Config) =>
  JSON.stringify({
    providers: config.providersConfig,
    language: config.language,
    translate: config.selectionToolbar.features.translate,
    glossary: config.glossary,
  })
/** A public-settings and credential-revision snapshot. No secrets or file paths in cache keys. */
export async function aiContext(
  config: Config,
  kind: AiCacheKind,
  parts: unknown[],
  signal: AbortSignal,
  documentId?: string,
  invalidate?: () => void,
) {
  const provider = resolveProviderRefForCapability(
    "selectionTranslation",
    config.providersConfig,
    config.selectionToolbar.features.translate.providerId,
  )
  if (!provider) throw new Error("Configure OpenAI in settings")
  const [status, epoch] = await Promise.all([
    sendMessage("getOpenAIKeyStatus", undefined),
    aiCacheEpoch(),
  ])
  signal.throwIfAborted()
  const documentEpoch = documentId ? await getPdfHistoryEpoch({ id: documentId, title: "PDF" }) : 0
  signal.throwIfAborted()
  const subscription = liveQuery(async () => [
    await aiCacheEpoch(),
    documentId ? await getPdfHistoryEpoch({ id: documentId, title: "PDF" }) : 0,
  ]).subscribe({
    next: (next) => {
      if (next[0] !== epoch || next[1] !== documentEpoch) invalidate?.()
    },
    error: () => invalidate?.(),
  })
  const identity = configIdentity(config)
  const current = async () => {
    signal.throwIfAborted()
    const [next, key, nextEpoch, nextDocumentEpoch] = await Promise.all([
      getLocalConfig(),
      sendMessage("getOpenAIKeyStatus", undefined),
      aiCacheEpoch(),
      documentId ? getPdfHistoryEpoch({ id: documentId, title: "PDF" }) : 0,
    ])
    signal.throwIfAborted()
    if (
      identity !== configIdentity(next) ||
      status.revision !== key.revision ||
      epoch !== nextEpoch ||
      documentEpoch !== nextDocumentEpoch
    )
      throw new DOMException("Configuration or cache changed; run again explicitly.", "AbortError")
  }
  let checking = false
  const verify = () => {
    if (checking || signal.aborted) return
    checking = true
    void current()
      .catch(() => {
        if (!signal.aborted) invalidate?.()
      })
      .finally(() => {
        checking = false
      })
  }
  const changed = (changes: Record<string, unknown>) => {
    if ("config" in changes) verify()
  }
  const visible = () => {
    if (document.visibilityState === "visible") verify()
  }
  const timer = typeof document !== "undefined" ? setInterval(visible, 5000) : undefined
  if (typeof window !== "undefined") {
    window.addEventListener("focus", verify)
    document.addEventListener("visibilitychange", visible)
  }
  browser.storage.onChanged.addListener(changed)
  const release = () => {
    subscription.unsubscribe()
    clearInterval(timer)
    browser.storage.onChanged.removeListener(changed)
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", verify)
      document.removeEventListener("visibilitychange", visible)
    }
  }
  signal.addEventListener("abort", release, { once: true })
  if (signal.aborted) release()
  return {
    provider,
    epoch,
    current,
    key: aiCacheKey(kind, identity, status.revision, documentId ?? "", documentEpoch, ...parts),
  }
}
