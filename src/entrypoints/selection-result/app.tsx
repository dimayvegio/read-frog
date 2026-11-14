import type { SelectionToolbarInlineError } from "@/components/ui/selection-popover/inline-error"
import type { ThinkingSnapshot } from "@/types/background-stream"
import type { Config } from "@/types/config/config"
import type { ImagePretranslation } from "@/types/image-translation"
import type { NativeSelectionRequest } from "@/types/native-selection"
import type { PdfHistoryRecord } from "@/utils/selection-result/pdf-history"
import { resolveLanguage } from "@read-frog/definitions"
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
import { aiCacheKey, readAiCache, saveAiCache } from "@/utils/ai-cache/db"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { getLocalConfig } from "@/utils/config/storage"
import { streamBackgroundText } from "@/utils/content-script/background-stream-client"
import { StreamPortError } from "@/utils/content-script/port-streaming"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
import { resolveProviderRefForCapability } from "@/utils/providers/provider-registry"
import { ProviderSetupError } from "@/utils/providers/provider-setup-error"
import { prepareStructuredPdfText } from "@/utils/selection-result/pdf-structure"
import {
  preparePdfText,
  DEFAULT_PDF_TEXT_OPTIONS,
  type PdfTextOptions,
} from "@/utils/selection-result/pdf-text"
import { translateNativeSelection } from "@/utils/selection-result/translate"
import { PdfHistoryPanel, pdfLanguageName } from "./pdf-history-panel"
import { PdfReaderButton } from "./pdf-reader-button"

interface CachedAiResult {
  output: string
  thinking: ThinkingSnapshot | null
  cacheState: string
}

// Module-level session cache: survives component remounts and tab switching
const sessionAiCache = new Map<string, CachedAiResult>()

export function clearSessionAiCache(): void {
  sessionAiCache.clear()
}

function getAiSessionKey(docId: string, text: string, mode: string): string {
  return `${docId || "doc"}:${text.trim()}:${mode}`
}

export function SelectionTranslation({
  request,
  config,
  panel,
  embedded = false,
  sourceTitle,
  imageCache = false,
  pretranslated,
  textOptions,
  onTextOptions,
}: {
  request: NativeSelectionRequest
  config: Config
  panel: boolean
  embedded?: boolean
  sourceTitle?: string
  imageCache?: boolean
  pretranslated?: ImagePretranslation
  textOptions: PdfTextOptions
  onTextOptions: (options: PdfTextOptions) => void
}) {
  const { targetCode: targetLanguage } = useAtomValue(configFieldsAtomMap.language)
  const initialText = typeof request.text === "string" ? request.text : ""
  const [output, setOutput] = useState("")
  const [thinking, setThinking] = useState<ThinkingSnapshot | null>(null)
  const [loading, setLoading] = useState(!request.tooLong)
  const [error, setError] = useState<SelectionToolbarInlineError | null>(null)
  const [retry, setRetry] = useState(0)
  const [sourceText, setSourceText] = useState(initialText)
  const [historical, setHistorical] = useState<PdfHistoryRecord | null>(null)
  const [aiMode, setAiMode] = useState<"translate" | "explain" | "summary">("translate")
  const [bypassCache, setBypassCache] = useState(false)
  const [cacheState, setCacheState] = useState("")
  const [historyRevision, setHistoryRevision] = useState(0)
  const tooLong =
    sourceText.length > MAX_NATIVE_SELECTION_LENGTH || (!sourceText && request.tooLong)
  const controllerRef = useRef<AbortController | null>(null)

  const switchAiMode = (newMode: "translate" | "explain" | "summary") => {
    if (newMode === aiMode) return
    setBypassCache(false)
    const targetSessionKey = getAiSessionKey(request.document?.id ?? "", sourceText, newMode)
    const cached = sessionAiCache.get(targetSessionKey)
    if (cached?.output) {
      controllerRef.current?.abort()
      setOutput(cached.output)
      setThinking(cached.thinking)
      setCacheState(
        cached.cacheState ||
          i18n.t("selectionResult.cacheLoaded") ||
          "Dùng bản lưu trên máy — không gọi API.",
      )
      setError(null)
      setLoading(false)
    }
    setAiMode(newMode)
  }

  useEffect(() => {
    if (tooLong || historical) return undefined
    const sessionKey = getAiSessionKey(request.document?.id ?? "", sourceText, aiMode)
    if (!bypassCache && sessionAiCache.get(sessionKey)?.output) {
      const mem = sessionAiCache.get(sessionKey)!
      setOutput(mem.output)
      setThinking(mem.thinking)
      setCacheState(
        mem.cacheState ||
          i18n.t("selectionResult.cacheLoaded") ||
          "Dùng bản lưu trên máy — không gọi API.",
      )
      setError(null)
      setLoading(false)
      return undefined
    }

    const controller = new AbortController()
    controllerRef.current = controller
    const abort = () => controller.abort()
    window.addEventListener("pagehide", abort)
    let accumulated = ""
    let latestThinking: ThinkingSnapshot | null = null

    void (async () => {
      try {
        const current = await getLocalConfig()
        controller.signal.throwIfAborted()
        setOutput("")
        setThinking(null)
        setError(null)
        setLoading(true)
        setCacheState("")
        if (aiMode === "explain" || aiMode === "summary") {
          const cacheKey = aiCacheKey(aiMode, request.document?.id ?? "", sourceText.trim())
          if (!bypassCache) {
            const cached = await readAiCache(cacheKey)
            if (cached) {
              if (controller.signal.aborted) return
              setOutput(cached)
              setThinking(null)
              const cacheMsg =
                i18n.t("selectionResult.cacheLoaded") || "Dùng bản lưu trên máy — không gọi API."
              setCacheState(cacheMsg)
              setLoading(false)
              sessionAiCache.set(sessionKey, {
                output: cached,
                thinking: null,
                cacheState: cacheMsg,
              })
              return
            }
          }
          const provider = resolveProviderRefForCapability(
            "selectionTranslation",
            current.providersConfig,
            current.selectionToolbar.features.translate.providerId,
          )
          if (!provider) throw new ProviderSetupError("Configure OpenAI in settings")
          const isVi = current.language.targetCode === "vi" || current.uiLanguage === "vi"
          const instructions =
            aiMode === "explain"
              ? isVi
                ? "Bạn là kỹ sư và chuyên gia công nghệ. Hãy giải thích kỹ thuật chi tiết về đoạn văn bản sau bằng tiếng Việt: làm rõ nghĩa của các thuật ngữ chuyên ngành, nguyên lý hoạt động và bối cảnh kỹ thuật trong thực tế."
                : "You are an expert engineer. Please provide a detailed technical explanation of the following text in English: clarify terminology, core mechanisms, and real-world engineering context."
              : isVi
                ? "Hãy tóm tắt ngắn gọn ý chính của đoạn văn bản sau bằng tiếng Việt (1 đến 3 câu súc tích hoặc các gạch đầu dòng ngắn)."
                : "Please summarize the core points of the following text concisely in English (1 to 3 clear sentences or bullet points)."
          await streamBackgroundText(
            {
              providerKind: "local",
              providerId: provider.config.id,
              providerConfig: provider.config,
              instructions,
              prompt: sourceText,
              usageTask: "selection",
            },
            {
              signal: controller.signal,
              onChunk: (chunk) => {
                if (controller.signal.aborted) return
                setOutput(chunk.output)
                accumulated = chunk.output
                latestThinking = chunk.thinking
                setThinking(chunk.thinking)
                if (chunk.output) {
                  sessionAiCache.set(sessionKey, {
                    output: chunk.output,
                    thinking: chunk.thinking,
                    cacheState:
                      i18n.t("selectionResult.cacheLoaded") ||
                      "Dùng bản lưu trên máy — không gọi API.",
                  })
                }
              },
            },
          )
          if (!controller.signal.aborted && accumulated) {
            await saveAiCache(cacheKey, aiMode, sourceText, accumulated)
            const stateMsg =
              aiMode === "explain"
                ? i18n.t("selectionResult.explainSaved") || "Đã lưu bản giải thích trên máy."
                : i18n.t("selectionResult.summarySaved") || "Đã lưu bản tóm tắt trên máy."
            setCacheState(stateMsg)
            sessionAiCache.set(sessionKey, {
              output: accumulated,
              thinking: latestThinking,
              cacheState: stateMsg,
            })
          }
        } else {
          const translateCacheKey = aiCacheKey(
            "translate",
            request.document?.id ?? "",
            sourceText.trim(),
          )
          const translateSessionKey = getAiSessionKey(
            request.document?.id ?? "",
            sourceText,
            "translate",
          )
          if (!bypassCache) {
            const cached = await readAiCache(translateCacheKey)
            if (cached) {
              if (controller.signal.aborted) return
              setOutput(cached)
              setThinking(null)
              const cacheMsg =
                i18n.t("selectionResult.cacheLoaded") || "Dùng bản lưu trên máy — không gọi API."
              setCacheState(cacheMsg)
              setLoading(false)
              sessionAiCache.set(translateSessionKey, {
                output: cached,
                thinking: null,
                cacheState: cacheMsg,
              })
              return
            }
          }
          const translated = await translateNativeSelection({
            text: sourceText,
            document: request.document,
            textOptions,
            bypassCache,
            imageCache,
            pretranslated,
            onCacheState: (state, message) => {
              if (controller.signal.aborted) return
              setCacheState(
                message ??
                  (state === "cached"
                    ? (i18n.t("selectionResult.cacheLoaded") ||
                      "Dùng bản lưu trên máy — không gọi API.")
                    : state === "saved"
                      ? (i18n.t("selectionResult.translationSaved") ||
                        "Đã lưu bản dịch trên máy.")
                      : "Đã dịch nhưng chưa lưu được lịch sử."),
              )
              if (state === "saved") setHistoryRevision((value) => value + 1)
            },
            config: { ...current, language: { ...current.language, targetCode: targetLanguage } },
            signal: controller.signal,
            onChunk: (chunk) => {
              if (controller.signal.aborted) return
              setOutput(chunk.output)
              setThinking(chunk.thinking)
              if (chunk.output) {
                sessionAiCache.set(translateSessionKey, {
                  output: chunk.output,
                  thinking: chunk.thinking,
                  cacheState:
                    i18n.t("selectionResult.cacheLoaded") ||
                    "Dùng bản lưu trên máy — không gọi API.",
                })
              }
            },
          })
          if (!controller.signal.aborted && translated.output) {
            setOutput(translated.output)
            setThinking(translated.thinking)
            const cacheMsg =
              i18n.t("selectionResult.cacheLoaded") || "Dùng bản lưu trên máy — không gọi API."
            sessionAiCache.set(translateSessionKey, {
              output: translated.output,
              thinking: translated.thinking,
              cacheState: cacheMsg,
            })
            void saveAiCache(translateCacheKey, "translate", sourceText, translated.output)
          }
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
      if (accumulated && accumulated.trim()) {
        sessionAiCache.set(sessionKey, {
          output: accumulated,
          thinking: latestThinking,
          cacheState:
            i18n.t("selectionResult.cacheLoaded") || "Dùng bản lưu trên máy — không gọi API.",
        })
        const cacheKey = aiCacheKey(aiMode, request.document?.id ?? "", sourceText.trim())
        void saveAiCache(cacheKey, aiMode, sourceText, accumulated)
      }
      controller.abort()
      window.removeEventListener("pagehide", abort)
    }
  }, [
    request,
    targetLanguage,
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- retry is an explicit regenerate action.
    retry,
    sourceText,
    textOptions,
    bypassCache,
    historical,
    tooLong,
    imageCache,
    pretranslated,
    aiMode,
  ])

  const rerun = () => {
    const sessionKey = getAiSessionKey(request.document?.id ?? "", sourceText, aiMode)
    sessionAiCache.delete(sessionKey)
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
          <SelectionToolbarTitleContent
            title={
              aiMode === "explain"
                ? (i18n.t("selectionResult.technicalExplain") || "Giải thích kỹ thuật")
                : aiMode === "summary"
                  ? (i18n.t("selectionResult.sectionSummary") || "Tóm tắt đoạn")
                  : (i18n.t("selectionResult.translateTab") || "Dịch")
            }
            icon={aiMode === "explain" ? "ri:cpu-line" : aiMode === "summary" ? "ri:file-text-line" : "ri:translate"}
          />
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
        <div className="flex items-center gap-1.5 border-b px-4 py-1.5 bg-muted/20 text-xs">
          <button
            type="button"
            className={`rounded px-2.5 py-1 font-medium transition-colors cursor-pointer ${
              aiMode === "translate"
                ? "bg-background text-foreground shadow-xs border"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => switchAiMode("translate")}
          >
            {i18n.t("selectionResult.translateTab") || "Dịch"}
          </button>
          <button
            type="button"
            className={`rounded px-2.5 py-1 font-medium transition-colors cursor-pointer ${
              aiMode === "explain"
                ? "bg-background text-foreground shadow-xs border"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => switchAiMode("explain")}
          >
            {i18n.t("selectionResult.technicalExplain") || "Giải thích kỹ thuật"}
          </button>
          <button
            type="button"
            className={`rounded px-2.5 py-1 font-medium transition-colors cursor-pointer ${
              aiMode === "summary"
                ? "bg-background text-foreground shadow-xs border"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => switchAiMode("summary")}
          >
            {i18n.t("selectionResult.sectionSummary") || "Tóm tắt đoạn"}
          </button>
        </div>
        <section className="shrink-0 border-b px-4 py-2 text-sm" data-testid="pdf-reading-controls">
          <p className="font-medium break-words">
            {request.document?.title ?? sourceTitle ?? "PDF / văn bản đã chọn"}
          </p>
          {panel && !embedded && (
            <p className="mt-1 text-xs text-muted-foreground">
              Khung cố định: bôi đen đoạn khác rồi chọn Read Frog → Translate để cập nhật.
            </p>
          )}
          {panel && !request.document && !sourceTitle && (
            <p className="mt-1 text-xs text-muted-foreground">
              Chưa nhận diện được tài liệu; đoạn này chưa lưu lịch sử theo file.
            </p>
          )}
          <details className="mt-2">
            <summary className="cursor-pointer">
              {sourceTitle ? "Văn bản và cách làm sạch" : "Văn bản PDF và cách làm sạch"}
            </summary>
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
                {request.document
                  ? "Chuẩn hóa Unicode; giữ nguyên dòng, danh sách và ô bảng"
                  : "Nối dòng giữa câu; giữ đoạn, danh sách và bảng"}
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={textOptions.joinHyphenatedWords}
                  disabled={!textOptions.clean || !!request.document}
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
                  {request.document
                    ? prepareStructuredPdfText(sourceText, textOptions)
                    : preparePdfText(sourceText, textOptions)}
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
                targetLanguage={
                  resolveLanguage(historical?.targetLanguage ?? targetLanguage) ?? targetLanguage
                }
                isTranslating={loading}
                thinking={thinking}
                renderMarkdown={aiMode === "explain" || aiMode === "summary"}
                vocabularySource={{
                  context: sourceText.slice(0, 1800),
                  sourceTitle: request.document?.title ?? sourceTitle ?? "PDF / văn bản đã chọn",
                  sourceUrl: "",
                  source: request.source ?? { kind: imageCache ? "image" : "pdf" },
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
