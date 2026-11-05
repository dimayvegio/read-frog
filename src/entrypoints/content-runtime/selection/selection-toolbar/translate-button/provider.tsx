import type { ReactNode } from "react"
import type { SelectionSession } from "../atoms"
import type { SelectionPopoverActions } from "@/components/ui/selection-popover"
import type { SelectionToolbarInlineError } from "@/components/ui/selection-popover/inline-error"
import type { ThinkingSnapshot } from "@/types/background-stream"
import { useAtomValue, useSetAtom } from "jotai"
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react"
import { toastManager } from "@/components/ui/base-ui/toast"
import { SelectionPopover } from "@/components/ui/selection-popover"
import {
  createSelectionToolbarPrecheckError,
  createSelectionToolbarRuntimeError,
  isAbortError,
} from "@/components/ui/selection-popover/inline-error"
import { SelectionToolbarErrorAlert } from "@/components/ui/selection-popover/selection-toolbar-error-alert"
import { SelectionToolbarFooterContent } from "@/components/ui/selection-popover/selection-toolbar-footer-content"
import { SelectionToolbarTitleContent } from "@/components/ui/selection-popover/selection-toolbar-title-content"
import { configFieldsAtomMap, writeConfigAtom } from "@/utils/atoms/config"
import { buildFeatureProviderPatch } from "@/utils/constants/feature-providers"
import { getSourceDocumentTitle } from "@/utils/content/document-title"
import { prepareTranslationText } from "@/utils/host/translate/text-preparation"
import { onMessage } from "@/utils/message"
import { toSelectionPromptContext } from "@/utils/prompts/selection-context"
import { getSelectableProvidersForCapability } from "@/utils/providers/provider-registry"
import { shadowWrapper } from "../../main"
import {
  isSelectionToolbarOpenAtom,
  selectionSessionAtom,
  selectionToolbarTranslateRequestAtom,
} from "../atoms"
import { useSelectionOpenRequestResolver } from "../use-selection-open-request"
import { useSelectionShortcuts } from "../use-selection-shortcuts"
import { checkSelectionTranslateProvider, translateSelection } from "./dispatch"
import { TargetLanguageSelector } from "./target-language-selector"
import { TranslationContent } from "./translation-content"

interface SelectionTranslatePendingOpenRequest {
  anchor?: { x: number; y: number }
  session: SelectionSession
}

interface SelectionTranslationContextValue {
  prepareToolbarOpen: () => void
  // Opens the translation from the toolbar without its button (from the
  // toolbar's "more" menu), anchored where that button would be.
  openToolbarTranslation: (anchorElement: HTMLElement | null) => void
}

const SelectionTranslationContext = createContext<SelectionTranslationContextValue | null>(null)

function useSelectionTranslationContext() {
  const context = use(SelectionTranslationContext)
  if (!context) {
    throw new Error(
      "Selection translation popover must be used within SelectionTranslationProvider.",
    )
  }

  return context
}

export function useSelectionTranslationPopover() {
  return useSelectionTranslationContext()
}

export function SelectionTranslationProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const [popoverSessionKey, setPopoverSessionKey] = useState(0)
  const [translatedText, setTranslatedText] = useState<string | undefined>(undefined)
  const [thinking, setThinking] = useState<ThinkingSnapshot | null>(null)
  const [error, setError] = useState<SelectionToolbarInlineError | null>(null)
  const [isTranslating, setIsTranslating] = useState(false)
  const [rerunNonce, setRerunNonce] = useState(0)
  const [activeSession, setActiveSession] = useState<SelectionSession | null>(null)
  const selectionSession = useAtomValue(selectionSessionAtom)
  const translateRequest = useAtomValue(selectionToolbarTranslateRequestAtom)
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)
  const selectionToolbar = useAtomValue(configFieldsAtomMap.selectionToolbar)
  const setIsSelectionToolbarOpen = useSetAtom(isSelectionToolbarOpenAtom)
  const setConfig = useSetAtom(writeConfigAtom)
  const abortControllerRef = useRef<AbortController | null>(null)
  const pendingOpenRequestRef = useRef<SelectionTranslatePendingOpenRequest | null>(null)
  const popoverActionsRef = useRef<SelectionPopoverActions | null>(null)
  const lastTranslationRunKeyRef = useRef<string | null>(null)
  const runIdRef = useRef(0)
  const { resolveContextMenuOpenRequest, resolveShortcutOpenRequest } =
    useSelectionOpenRequestResolver(selectionSession)
  const selectionText = activeSession?.selectionSnapshot.text ?? null
  const paragraphsText = activeSession?.contextSnapshot.text ?? selectionText
  const selectionContext = useMemo(
    () =>
      toSelectionPromptContext(
        activeSession?.contextSnapshot.paragraphs,
        activeSession?.selectionSnapshot.text ?? "",
      ),
    [activeSession],
  )
  const titleText = getSourceDocumentTitle() || null
  const translateProviders = useMemo(
    () => getSelectableProvidersForCapability("selectionTranslation", providersConfig),
    [providersConfig],
  )
  const translateRequestKey = useMemo(() => JSON.stringify(translateRequest), [translateRequest])
  const resetPopoverSession = useCallback((options?: { clearAnchor?: boolean }) => {
    setActiveSession(null)
    if (options?.clearAnchor) {
      setAnchor(null)
    }
  }, [])

  const resetTranslationState = useCallback(() => {
    setIsTranslating(false)
    setTranslatedText(undefined)
    setThinking(null)
    setError(null)
  }, [])

  const cancelCurrentTranslation = useCallback((runId?: number) => {
    if (runId !== undefined && runIdRef.current !== runId) {
      return
    }

    runIdRef.current += 1
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }, [])

  // Anchor application is owned by SelectionPopover.Root (via requestOpen) so
  // a pinned popover reused in place never moves.
  const commitOpenRequest = useCallback((request: SelectionTranslatePendingOpenRequest) => {
    pendingOpenRequestRef.current = request
  }, [])

  const applyPendingSession = useCallback(() => {
    const pendingRequest = pendingOpenRequestRef.current

    setActiveSession(pendingRequest?.session ?? selectionSession)
    setIsSelectionToolbarOpen(false)
    pendingOpenRequestRef.current = null
  }, [selectionSession, setIsSelectionToolbarOpen])

  const handleProviderChange = useCallback(
    (providerId: string) => {
      void setConfig(buildFeatureProviderPatch({ selectionTranslation: providerId }))
    },
    [setConfig],
  )

  const handleRegenerate = useCallback(() => {
    cancelCurrentTranslation()
    setRerunNonce((prev) => prev + 1)
  }, [cancelCurrentTranslation])

  const runTranslation = useCallback(
    async (runId: number) => {
      const preparedText = prepareTranslationText(selectionText)

      if (preparedText === "") {
        if (runIdRef.current === runId) {
          resetTranslationState()
        }
        return
      }

      setIsTranslating(true)
      setTranslatedText(undefined)
      setThinking(null)
      setError(null)

      const provider = translateRequest.provider
      const precheck = checkSelectionTranslateProvider(provider)
      if (precheck || !provider) {
        if (runIdRef.current === runId) {
          setIsTranslating(false)
          setError(
            createSelectionToolbarPrecheckError("translate", precheck ?? "providerUnavailable"),
          )
        }

        return
      }

      try {
        setThinking({ status: "thinking", text: "" })

        const result = await translateSelection({
          preparedText,
          provider,
          translateRequest,
          selectionContext,
          onChunk: (data) => {
            if (runIdRef.current === runId) {
              setTranslatedText(data.output)
              setThinking(data.thinking)
            }
          },
          registerAbortController: (abortController) => {
            abortControllerRef.current = abortController
          },
        })

        if (runIdRef.current === runId) {
          setThinking(result.thinking)
          setTranslatedText(result.output)
        }
      } catch (caughtError) {
        if (!isAbortError(caughtError) && runIdRef.current === runId) {
          setThinking((prev) => (prev?.text ? { ...prev, status: "complete" } : null))
          setError(createSelectionToolbarRuntimeError("translate", caughtError))
        }
      } finally {
        if (runIdRef.current === runId) {
          abortControllerRef.current = null
          setIsTranslating(false)
        }
      }
    },
    [resetTranslationState, selectionContext, selectionText, translateRequest],
  )

  const startTranslation = useEffectEvent((runId: number) => {
    void runTranslation(runId)
  })

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const nextRunKey = JSON.stringify({
      popoverSessionKey,
      rerunNonce,
      sessionId: activeSession?.id ?? null,
      translateRequestKey,
    })
    if (lastTranslationRunKeyRef.current === nextRunKey) {
      return undefined
    }
    lastTranslationRunKeyRef.current = nextRunKey

    const runId = runIdRef.current + 1
    runIdRef.current = runId

    startTranslation(runId)

    return () => {
      cancelCurrentTranslation(runId)
    }
  }, [
    activeSession?.id,
    cancelCurrentTranslation,
    isOpen,
    popoverSessionKey,
    rerunNonce,
    translateRequestKey,
  ])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      cancelCurrentTranslation()
      resetTranslationState()

      if (nextOpen) {
        setPopoverSessionKey((prev) => prev + 1)
        applyPendingSession()
      } else {
        resetPopoverSession({
          clearAnchor: pendingOpenRequestRef.current === null,
        })
        lastTranslationRunKeyRef.current = null
      }

      setIsOpen(nextOpen)
    },
    [applyPendingSession, cancelCurrentTranslation, resetPopoverSession, resetTranslationState],
  )

  // Pinned popovers are reused in place for a new selection: the window keeps
  // its position, size, and pin state while the translation restreams. All
  // state writes stay in one handler so the translation run-key effect
  // observes exactly one key change.
  const handleReuseRequest = useCallback(() => {
    cancelCurrentTranslation()
    resetTranslationState()
    applyPendingSession()
    // Forces a rerun even when the same selection session is retriggered, and
    // rotates the note-suggestion session key (which has no session id).
    setRerunNonce((prev) => prev + 1)
  }, [applyPendingSession, cancelCurrentTranslation, resetTranslationState])

  const prepareToolbarOpen = useCallback(() => {
    if (!selectionSession) {
      return
    }

    commitOpenRequest({
      session: selectionSession,
    })
  }, [commitOpenRequest, selectionSession])

  const resolveContextMenuRequest = useCallback((): SelectionTranslatePendingOpenRequest | null => {
    const request = resolveContextMenuOpenRequest()
    if (!request) {
      return null
    }

    return {
      anchor: request.anchor,
      session: request.session,
    }
  }, [resolveContextMenuOpenRequest])

  const resolveShortcutRequest = useCallback(
    (session: SelectionSession | null): SelectionTranslatePendingOpenRequest | null => {
      const request = resolveShortcutOpenRequest(session)
      if (!request) {
        return null
      }

      return {
        anchor: request.anchor,
        session: request.session,
      }
    },
    [resolveShortcutOpenRequest],
  )

  const openSelectionTranslationRequest = useCallback(
    (
      request: SelectionTranslatePendingOpenRequest | null,
      options?: { showMissingSelectionToast?: boolean },
    ) => {
      if (!request) {
        if (options?.showMissingSelectionToast) {
          const nextError = createSelectionToolbarPrecheckError("translate", "missingSelection")
          toastManager.add({ type: "error", title: nextError.description })
        }
        return
      }

      commitOpenRequest(request)
      popoverActionsRef.current?.requestOpen(request.anchor ?? null)
    },
    [commitOpenRequest],
  )

  const openToolbarTranslation = useCallback(
    (anchorElement: HTMLElement | null) => {
      if (!selectionSession || !anchorElement) {
        return
      }

      const rect = anchorElement.getBoundingClientRect()
      openSelectionTranslationRequest({
        anchor: { x: rect.left, y: rect.top },
        session: selectionSession,
      })
    },
    [openSelectionTranslationRequest, selectionSession],
  )

  const openFromContextMenu = useCallback(() => {
    openSelectionTranslationRequest(resolveContextMenuRequest(), {
      showMissingSelectionToast: true,
    })
  }, [openSelectionTranslationRequest, resolveContextMenuRequest])

  // Turned off, the button and its key go together, as Speak's and the actions' do. Hiding the
  // whole toolbar does not stop the key.
  useSelectionShortcuts(
    {
      translate: selectionToolbar.features.translate.enabled
        ? selectionToolbar.features.translate.shortcut
        : undefined,
    },
    (_, session) => {
      const request = resolveShortcutRequest(session)
      if (!request) {
        return false
      }
      openSelectionTranslationRequest(request)
      return true
    },
  )

  useEffect(() => {
    return onMessage("openSelectionTranslationFromContextMenu", () => {
      openFromContextMenu()
    })
  }, [openFromContextMenu])

  const contextValue = useMemo<SelectionTranslationContextValue>(
    () => ({
      prepareToolbarOpen,
      openToolbarTranslation,
    }),
    [openToolbarTranslation, prepareToolbarOpen],
  )

  return (
    <SelectionTranslationContext value={contextValue}>
      <SelectionPopover.Root
        open={isOpen}
        onOpenChange={handleOpenChange}
        anchor={anchor}
        onAnchorChange={setAnchor}
        actionsRef={popoverActionsRef}
        onReuseRequest={handleReuseRequest}
      >
        {children}
        <SelectionPopover.Content
          key={popoverSessionKey}
          container={shadowWrapper ?? document.body}
          finalFocus={false}
        >
          <SelectionPopover.Header className="border-b">
            <SelectionToolbarTitleContent title="Translation" icon="ri:translate" />
            <div className="flex items-center gap-1">
              <TargetLanguageSelector />
              <SelectionPopover.Pin />
              <SelectionPopover.Close />
            </div>
          </SelectionPopover.Header>

          <SelectionPopover.Body key={`${popoverSessionKey}:${activeSession?.id ?? 0}`}>
            <TranslationContent
              selectionContent={selectionText}
              translatedText={translatedText}
              isTranslating={isTranslating}
              thinking={thinking}
            />
            <SelectionToolbarErrorAlert error={error} className="-mt-3" />
          </SelectionPopover.Body>
          <SelectionToolbarFooterContent
            paragraphsText={paragraphsText}
            providers={translateProviders}
            titleText={titleText}
            value={translateRequest.provider?.id ?? ""}
            onProviderChange={handleProviderChange}
            onRegenerate={handleRegenerate}
          />
        </SelectionPopover.Content>
      </SelectionPopover.Root>
    </SelectionTranslationContext>
  )
}
