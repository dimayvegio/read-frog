import type { SelectionToolbarInlineError } from "@/components/ui/selection-popover/inline-error"
import type { ThinkingSnapshot } from "@/types/background-stream"
import type { Config } from "@/types/config/config"
import type { NativeSelectionRequest } from "@/types/native-selection"
import type { PdfHistoryRecord } from "@/utils/selection-result/pdf-history"
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
  NATIVE_PANEL_STORAGE_PREFIX,
} from "@/types/native-selection"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { getLocalConfig } from "@/utils/config/storage"
import { StreamPortError } from "@/utils/content-script/port-streaming"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
import {
  preparePdfText,
  DEFAULT_PDF_TEXT_OPTIONS,
  type PdfTextOptions,
} from "@/utils/selection-result/pdf-text"
import { translateNativeSelection } from "@/utils/selection-result/translate"
import { PdfHistoryPanel, pdfLanguageName } from "./pdf-history-panel"
import { PdfReaderButton } from "./pdf-reader-button"

export function SelectionTranslation({
  request,
  config,
  panel,
  embedded = false,
  textOptions,
  onTextOptions,
}: {
  request: NativeSelectionRequest
  config: Config
  panel: boolean
  embedded?: boolean
  textOptions: PdfTextOptions
  onTextOptions: (options: PdfTextOptions) => void
}) {
  const { targetCode: targetLanguage } = useAtomValue(configFieldsAtomMap.language)
  const [output, setOutput] = useState("")
  const [thinking, setThinking] = useState<ThinkingSnapshot | null>(null)
  const [loading, setLoading] = useState(!request.tooLong)
  const [error, setError] = useState<SelectionToolbarInlineError | null>(null)
  const [retry, setRetry] = useState(0)
  const [sourceText, setSourceText] = useState(request.text)
  const [historical, setHistorical] = useState<PdfHistoryRecord | null>(null)
  const [bypassCache, setBypassCache] = useState(false)
  const [cacheState, setCacheState] = useState("")
  const [historyRevision, setHistoryRevision] = useState(0)
  const tooLong =
    sourceText.length > MAX_NATIVE_SELECTION_LENGTH || (!sourceText && request.tooLong)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (tooLong || historical) return undefined
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
        setCacheState("")
        const translated = await translateNativeSelection({
          text: sourceText,
          document: request.document,
          textOptions,
          bypassCache,
          onCacheState: (state, message) => {
            if (controller.signal.aborted) return
            setCacheState(
              state === "cached"
                ? "Dùng bản lưu trên máy — không gọi API."
                : state === "saved"
                  ? "Đã lưu bản dịch trên máy."
                  : (message ?? "Đã dịch nhưng chưa lưu được lịch sử."),
            )
            if (state === "saved") setHistoryRevision((value) => value + 1)
          },
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
  }, [request, targetLanguage, retry, sourceText, textOptions, bypassCache, historical, tooLong])

  const rerun = () => {
    controllerRef.current?.abort()
    setOutput("")
    setThinking(null)
    setError(null)
    setLoading(true)
    setHistorical(null)
    setBypassCache(true)
    setRetry((value) => value + 1)
  }

  return (
    <SelectionPopover.Root
      open
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open && !panel) window.close()
      }}
    >
      <div
        className={`${panel ? "min-h-0 flex-1" : "h-screen"} flex flex-col bg-popover text-popover-foreground`}
      >
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
                  setThinking(null)
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
            {!panel && <SelectionPopover.Close />}
          </div>
        </header>
        <section className="shrink-0 border-b px-4 py-2 text-sm" data-testid="pdf-reading-controls">
          <p className="font-medium break-words">
            {request.document?.title ?? "PDF / văn bản đã chọn"}
          </p>
          {panel && !embedded && (
            <p className="mt-1 text-xs text-muted-foreground">
              Khung cố định: bôi đen đoạn khác rồi chọn Read Frog → Translate để cập nhật.
            </p>
          )}
          {panel && !request.document && (
            <p className="mt-1 text-xs text-muted-foreground">
              Chưa nhận diện được tài liệu; đoạn này chưa lưu lịch sử theo file.
            </p>
          )}
          <details className="mt-2">
            <summary className="cursor-pointer">Văn bản PDF và cách làm sạch</summary>
            <div className="mt-2 space-y-2">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={textOptions.clean}
                  onChange={(event) => {
                    setHistorical(null)
                    setBypassCache(false)
                    onTextOptions({ ...textOptions, clean: event.target.checked })
                  }}
                />
                Nối dòng giữa câu; giữ đoạn, danh sách và bảng
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={textOptions.joinHyphenatedWords}
                  disabled={!textOptions.clean}
                  onChange={(event) => {
                    setHistorical(null)
                    setBypassCache(false)
                    onTextOptions({ ...textOptions, joinHyphenatedWords: event.target.checked })
                  }}
                />
                Bỏ dấu “-” khi từ bị ngắt qua dòng
              </label>
              <p className="text-xs text-muted-foreground">
                Tùy chọn bỏ “-” có thể ghép nhầm từ như well-known. Có thể xem đoạn gốc và văn bản
                dùng để dịch bên dưới, hoặc tắt làm sạch để giữ nguyên văn bản. Đổi tùy chọn sẽ dịch
                lại đoạn đang xem.
              </p>
              <details>
                <summary className="cursor-pointer text-xs">Đoạn gốc</summary>
                <pre className="mt-1 max-h-28 overflow-y-auto text-xs break-words whitespace-pre-wrap">
                  {sourceText}
                </pre>
              </details>
              <details>
                <summary className="cursor-pointer text-xs">Văn bản dùng để dịch</summary>
                <pre className="mt-1 max-h-28 overflow-y-auto text-xs break-words whitespace-pre-wrap">
                  {preparePdfText(sourceText, textOptions)}
                </pre>
              </details>
            </div>
          </details>
          {cacheState && (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              {cacheState}
            </p>
          )}
          {historical && (
            <p className="mt-2 text-xs">
              Đang xem bản lưu sang {pdfLanguageName(historical.targetLanguage)}; chưa gọi API. Bấm
              dịch lại để tạo kết quả theo cấu hình hiện tại.
            </p>
          )}
          {sourceText !== request.text && (
            <Button
              className="mt-2"
              size="sm"
              variant="outline"
              onClick={() => {
                setSourceText(request.text)
                setHistorical(null)
                setBypassCache(false)
                setRetry((value) => value + 1)
              }}
            >
              Về đoạn đang chọn trong PDF
            </Button>
          )}
        </section>
        {request.document && (
          <PdfHistoryPanel
            document={request.document}
            revision={historyRevision}
            onClear={() => {
              controllerRef.current?.abort()
              setLoading(false)
              setCacheState("")
            }}
            onSelect={(record) => {
              controllerRef.current?.abort()
              setHistorical(record)
              setSourceText(record.original)
              setOutput(record.output)
              setThinking(null)
              setError(null)
              setLoading(false)
              setBypassCache(false)
              setCacheState("Đang xem bản dịch đã lưu trên máy.")
              onTextOptions({
                clean: record.clean,
                joinHyphenatedWords: record.joinHyphenatedWords,
              })
            }}
          />
        )}
        <div
          data-testid="native-selection-output"
          data-selection-id={request.id}
          aria-live="polite"
          aria-busy={loading}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {tooLong ? (
            <p role="alert" className="p-4 text-sm">
              {i18n.t("selectionResult.tooLong", [MAX_NATIVE_SELECTION_LENGTH])}
            </p>
          ) : (
            <>
              <TranslationContent
                key={`${request.id}:${historical?.id ?? `current-${retry}`}`}
                selectionContent={sourceText}
                translatedText={output}
                isTranslating={loading}
                thinking={thinking}
                vocabularySource={{
                  context: sourceText.slice(0, 1800),
                  sourceTitle: request.document?.title ?? "PDF / văn bản đã chọn",
                  sourceUrl: "",
                }}
              />
              <SelectionToolbarErrorAlert error={error} className="-mt-3" />
            </>
          )}
        </div>
        <SelectionToolbarFooterContent
          providers={config.providersConfig}
          value={config.selectionToolbar.features.translate.providerId}
          paragraphsText={sourceText || undefined}
          titleText={undefined}
          onProviderChange={() => {}}
          onRegenerate={() => {
            if (!tooLong) rerun()
          }}
        />
      </div>
    </SelectionPopover.Root>
  )
}

export default function App({ panel = false }: { panel?: boolean }) {
  const [state, setState] = useState<{ request: NativeSelectionRequest; config: Config } | null>(
    null,
  )
  const [ready, setReady] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [readAttempt, setReadAttempt] = useState(0)
  const [textOptions, setTextOptions] = useState(DEFAULT_PDF_TEXT_OPTIONS)
  const selectionId = new URLSearchParams(location.search).get("selectionId") ?? ""
  useEffect(() => {
    let disposed = false
    let version = 0
    const refresh = async () => {
      const readVersion = ++version
      try {
        const getSelection = async () => {
          if (!panel) return sendMessage("getNativeSelection", { selectionId })
          const window = await browser.windows.getCurrent()
          if (window.id === undefined) throw new Error("Cannot determine panel window")
          return sendMessage("getNativePanelSelection", { windowId: window.id })
        }
        const [request, config] = await Promise.all([getSelection(), getLocalConfig()])
        if (!disposed && version === readVersion) {
          setLoadFailed(false)
          setState((previous) =>
            previous?.request.id === request?.id ? previous : request ? { request, config } : null,
          )
        }
      } catch {
        if (!disposed && version === readVersion) {
          setState(null)
          setLoadFailed(true)
        }
      } finally {
        if (!disposed && version === readVersion) setReady(true)
      }
    }
    const changed = (changes: Record<string, unknown>) => {
      if (
        panel
          ? Object.keys(changes).some(
              (key) =>
                key.startsWith(NATIVE_PANEL_STORAGE_PREFIX) ||
                key.startsWith(NATIVE_SELECTION_STORAGE_PREFIX),
            )
          : `${NATIVE_SELECTION_STORAGE_PREFIX}${selectionId}` in changes
      )
        void refresh()
    }
    browser.storage.session.onChanged.addListener(changed)
    void refresh()
    return () => {
      disposed = true
      browser.storage.session.onChanged.removeListener(changed)
    }
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- readAttempt is the user's explicit request to retry loading the same session channel.
  }, [selectionId, readAttempt, panel])
  return (
    <main className={panel ? "flex h-screen flex-col" : undefined}>
      {panel && <PdfReaderButton />}
      {state ? (
        <SelectionTranslation
          key={state.request.id}
          request={state.request}
          config={state.config}
          panel={panel}
          textOptions={textOptions}
          onTextOptions={setTextOptions}
        />
      ) : ready && loadFailed ? (
        <div role="alert" className="space-y-3 p-4 text-sm">
          <p>{i18n.t("selectionResult.loadFailed")}</p>
          <Button
            variant="outline"
            onClick={() => {
              setReady(false)
              setReadAttempt((value) => value + 1)
            }}
          >
            {i18n.t("selectionResult.retry")}
          </Button>
        </div>
      ) : ready ? (
        <p role="status" className="p-4 text-sm text-muted-foreground">
          {panel
            ? "Khung dịch PDF đã sẵn sàng. Bôi đen văn bản trong PDF, chuột phải → Read Frog → Translate hoặc Dịch trong khung cố định (PDF). Bản dịch và lịch sử sẽ xuất hiện tại đây."
            : i18n.t("selectionResult.empty")}
        </p>
      ) : (
        <IconLoader2 className="m-4 size-4 animate-spin" />
      )}
    </main>
  )
}
