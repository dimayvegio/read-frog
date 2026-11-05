import type { SelectionToolbarInlineError } from "@/components/ui/selection-popover/inline-error"
import type { ThinkingSnapshot } from "@/types/background-stream"
import type { Config } from "@/types/config/config"
import type { NativeSelectionRequest } from "@/types/native-selection"
import { IconLoader2, IconPlayerStop, IconSettings } from "@tabler/icons-react"
import { useAtomValue } from "jotai"
import { useEffect, useRef, useState } from "react"
import { browser } from "#imports"
import { Button } from "@/components/ui/base-ui/button"
import { SelectionPopover } from "@/components/ui/selection-popover"
import { createSelectionToolbarRuntimeError } from "@/components/ui/selection-popover/inline-error"
import { SelectionToolbarErrorAlert } from "@/components/ui/selection-popover/selection-toolbar-error-alert"
import { SelectionToolbarFooterContent } from "@/components/ui/selection-popover/selection-toolbar-footer-content"
import { SelectionToolbarTitleContent } from "@/components/ui/selection-popover/selection-toolbar-title-content"
import { TargetLanguageSelector } from "@/entrypoints/content-runtime/selection/selection-toolbar/translate-button/target-language-selector"
import { TranslationContent } from "@/entrypoints/content-runtime/selection/selection-toolbar/translate-button/translation-content"
import {
  MAX_NATIVE_SELECTION_LENGTH,
  NATIVE_SELECTION_STORAGE_PREFIX,
} from "@/types/native-selection"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { getLocalConfig } from "@/utils/config/storage"
import { StreamPortError } from "@/utils/content-script/port-streaming"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
import { translateNativeSelection } from "@/utils/selection-result/translate"

function SelectionTranslation({
  request,
  config,
}: {
  request: NativeSelectionRequest
  config: Config
}) {
  const { targetCode: targetLanguage } = useAtomValue(configFieldsAtomMap.language)
  const [output, setOutput] = useState("")
  const [thinking, setThinking] = useState<ThinkingSnapshot | null>(null)
  const [loading, setLoading] = useState(!request.tooLong)
  const [error, setError] = useState<SelectionToolbarInlineError | null>(null)
  const [retry, setRetry] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (request.tooLong) return undefined
    const controller = new AbortController()
    controllerRef.current = controller
    const abort = () => controller.abort()
    window.addEventListener("pagehide", abort)
    void (async () => {
      try {
        const current = await getLocalConfig()
        controller.signal.throwIfAborted()
        setOutput("")
        setThinking(null)
        setError(null)
        setLoading(true)
        const translated = await translateNativeSelection({
          text: request.text,
          config: { ...current, language: { ...current.language, targetCode: targetLanguage } },
          signal: controller.signal,
          onChunk: (chunk) => {
            if (controller.signal.aborted) return
            setOutput(chunk.output)
            setThinking(chunk.thinking)
          },
        })
        if (!controller.signal.aborted) {
          setOutput(translated.output)
          setThinking(translated.thinking)
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            createSelectionToolbarRuntimeError(
              "translate",
              cause instanceof StreamPortError
                ? cause
                : new Error(i18n.t("selectionResult.failed")),
            ),
          )
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => {
      controller.abort()
      window.removeEventListener("pagehide", abort)
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- retry is the user's explicit request to start another translation.
  }, [request, targetLanguage, retry])

  const rerun = () => {
    controllerRef.current?.abort()
    setOutput("")
    setThinking(null)
    setError(null)
    setLoading(true)
    setRetry((value) => value + 1)
  }

  return (
    <SelectionPopover.Root
      open
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open) window.close()
      }}
    >
      <div className="flex h-screen flex-col bg-popover text-popover-foreground">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-2">
          <SelectionToolbarTitleContent title="Translation" icon="ri:translate" />
          <div className="flex items-center gap-1">
            <TargetLanguageSelector />
            {loading && (
              <Button
                size="icon-sm"
                variant="ghost-secondary"
                aria-label={i18n.t("selectionResult.stop")}
                onClick={() => {
                  controllerRef.current?.abort()
                  setLoading(false)
                }}
              >
                <IconPlayerStop />
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost-secondary"
              aria-label={i18n.t("selectionResult.settings")}
              onClick={() => {
                void sendMessage("openOptionsPage", { route: "/api-providers" })
              }}
            >
              <IconSettings />
            </Button>
            <SelectionPopover.Close />
          </div>
        </header>
        <div
          data-testid="native-selection-output"
          aria-live="polite"
          aria-busy={loading}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {request.tooLong ? (
            <p role="alert" className="p-4 text-sm">
              {i18n.t("selectionResult.tooLong", [MAX_NATIVE_SELECTION_LENGTH])}
            </p>
          ) : (
            <>
              <TranslationContent
                selectionContent={request.text}
                translatedText={output}
                isTranslating={loading}
                thinking={thinking}
              />
              <SelectionToolbarErrorAlert error={error} className="-mt-3" />
            </>
          )}
        </div>
        <SelectionToolbarFooterContent
          providers={config.providersConfig}
          value={config.selectionToolbar.features.translate.providerId}
          paragraphsText={request.text || undefined}
          titleText={undefined}
          onProviderChange={() => {}}
          onRegenerate={() => {
            if (!request.tooLong) rerun()
          }}
        />
      </div>
    </SelectionPopover.Root>
  )
}

export default function App() {
  const [state, setState] = useState<{ request: NativeSelectionRequest; config: Config } | null>(
    null,
  )
  const [ready, setReady] = useState(false)
  const rawTabId = new URLSearchParams(location.search).get("sourceTabId")
  const sourceTabId = rawTabId === null ? -1 : Number(rawTabId)
  useEffect(() => {
    let disposed = false
    let version = 0
    const refresh = async () => {
      const readVersion = ++version
      try {
        const [request, config] = await Promise.all([
          sendMessage("getNativeSelection", { sourceTabId }),
          getLocalConfig(),
        ])
        if (!disposed && version === readVersion) {
          setState((previous) =>
            previous?.request.id === request?.id ? previous : request ? { request, config } : null,
          )
        }
      } catch {
        if (!disposed && version === readVersion) setState(null)
      } finally {
        if (!disposed && version === readVersion) setReady(true)
      }
    }
    const changed = (changes: Record<string, unknown>) => {
      if (`${NATIVE_SELECTION_STORAGE_PREFIX}${sourceTabId}` in changes) void refresh()
    }
    browser.storage.session.onChanged.addListener(changed)
    void refresh()
    return () => {
      disposed = true
      browser.storage.session.onChanged.removeListener(changed)
    }
  }, [sourceTabId])
  return (
    <main>
      {state ? (
        <SelectionTranslation
          key={state.request.id}
          request={state.request}
          config={state.config}
        />
      ) : ready ? (
        <p role="status" className="p-4 text-sm text-muted-foreground">
          {i18n.t("selectionResult.empty")}
        </p>
      ) : (
        <IconLoader2 className="m-4 size-4 animate-spin" />
      )}
    </main>
  )
}
