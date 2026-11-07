import type { VocabularyCapture } from "@/utils/vocabulary/schema"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useMemo, useRef } from "react"
import { SelectionPopover } from "@/components/ui/selection-popover"
import { SaveVocabularyButton } from "@/components/ui/selection-popover/save-vocabulary-button"
import { SelectionToolbarErrorAlert } from "@/components/ui/selection-popover/selection-toolbar-error-alert"
import { SelectionToolbarFooterContent } from "@/components/ui/selection-popover/selection-toolbar-footer-content"
import { SelectionToolbarTitleContent } from "@/components/ui/selection-popover/selection-toolbar-title-content"
import { configFieldsAtomMap, writeConfigAtom } from "@/utils/atoms/config"
import { BUILT_IN_DICTIONARY_ACTION_ID } from "@/utils/constants/custom-action"
import { getSourceDocumentTitle } from "@/utils/content/document-title"
import { findSelectionToolbarAction, patchSelectionToolbarAction } from "@/utils/custom-actions"
import {
  getSelectableProvidersForCapability,
  resolveProviderRefForCapability,
} from "@/utils/providers/provider-registry"
import { customActionRequestAtom } from "./atoms"
import { CustomActionContent } from "./custom-action-content"
import { CustomActionToolButton } from "./custom-action-tool-button"
import {
  buildCustomActionExecutionPlan,
  useCustomActionExecution,
  useCustomActionWebPageContext,
} from "./use-custom-action-execution"

export function CustomActionPanel({
  vocabularySource,
}: { vocabularySource?: Omit<VocabularyCapture, "word" | "context"> } = {}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [request, setRequest] = useAtom(customActionRequestAtom)
  const language = useAtomValue(configFieldsAtomMap.language)
  const selectionToolbarConfig = useAtomValue(configFieldsAtomMap.selectionToolbar)
  const providersConfig = useAtomValue(configFieldsAtomMap.providersConfig)
  const setConfig = useSetAtom(writeConfigAtom)
  const open = request !== null
  const actionId = request?.actionId ?? null
  const cleanSelection = request?.cleanSelection ?? ""

  const action = useMemo(() => {
    const found = actionId && findSelectionToolbarAction(selectionToolbarConfig, actionId)
    return found && found.enabled !== false ? found : null
  }, [actionId, selectionToolbarConfig])
  const provider = useMemo(
    () =>
      action && resolveProviderRefForCapability("customAction", providersConfig, action.providerId),
    [action, providersConfig],
  )
  const providers = useMemo(
    () => getSelectableProvidersForCapability("customAction", providersConfig),
    [providersConfig],
  )

  const webPageContext = useCustomActionWebPageContext(open, request?.sessionKey ?? 0)
  const { executionContext, error: precheckError } = useMemo(
    () =>
      buildCustomActionExecutionPlan(
        { language, action, provider },
        cleanSelection,
        request?.contextText ?? "",
        webPageContext,
      ),
    [action, cleanSelection, language, provider, request?.contextText, webPageContext],
  )
  const execution = useCustomActionExecution({
    bodyRef,
    executionContext,
    open,
    popoverSessionKey: request?.sessionKey ?? 0,
    rerunNonce: request?.rerunNonce ?? 0,
  })

  if (!request) {
    return null
  }

  const changeProvider = (providerId: string) => {
    void setConfig({
      selectionToolbar: patchSelectionToolbarAction(selectionToolbarConfig, request.actionId, {
        providerId,
      }),
    })
  }
  const regenerate = () => setRequest({ ...request, rerunNonce: request.rerunNonce + 1 })

  const result = executionContext ? execution.result : null
  const error = execution.error ?? precheckError
  const isRunning = webPageContext === undefined || (executionContext ? execution.isRunning : false)
  const status = isRunning ? "streaming" : error ? "error" : "done"
  const titleText = (webPageContext?.webTitle ?? getSourceDocumentTitle()) || null
  return (
    <>
      <SelectionPopover.Header className="border-b">
        <SelectionToolbarTitleContent
          title={action?.name ?? "Custom Action"}
          icon={action?.icon ?? "tabler:sparkles"}
        />
        <div className="flex items-center gap-1">
          <SelectionPopover.Pin />
          <SelectionPopover.Close />
        </div>
      </SelectionPopover.Header>
      <SelectionPopover.Body key={`${request.sessionKey}:${request.selectionText}`} ref={bodyRef}>
        <CustomActionContent
          action={action}
          status={status}
          selection={cleanSelection}
          targetCode={language.targetCode}
          selectionContent={request.selectionText}
          value={result}
          thinking={executionContext ? execution.thinking : null}
        />
        <SelectionToolbarErrorAlert error={error} />
        {action?.id === BUILT_IN_DICTIONARY_ACTION_ID &&
          status === "done" &&
          result &&
          cleanSelection && (
            <div className="px-4 pb-4" data-slot="dictionary-save-vocabulary">
              <SaveVocabularyButton
                capture={{
                  word: cleanSelection,
                  context: request.contextText.slice(0, 1800),
                  sourceTitle: vocabularySource?.sourceTitle ?? titleText ?? "",
                  sourceUrl: vocabularySource?.sourceUrl ?? webPageContext?.url ?? "",
                  ...(vocabularySource?.source ? { source: vocabularySource.source } : {}),
                }}
              />
            </div>
          )}
      </SelectionPopover.Body>
      <SelectionToolbarFooterContent
        paragraphsText={request.contextText}
        providers={providers}
        titleText={titleText}
        value={provider?.id ?? ""}
        onProviderChange={changeProvider}
        onRegenerate={regenerate}
      >
        {action && (
          <>
            <CustomActionToolButton action={action} />
          </>
        )}
      </SelectionToolbarFooterContent>
    </>
  )
}
