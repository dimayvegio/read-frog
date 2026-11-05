import type { APIProviderConfig } from "@/types/config/provider"
import type { SelectionToolbarCustomAction } from "@/types/config/selection-toolbar"
import { atom } from "jotai"
import { openAIPublicConfigSchema } from "@/types/config/openai"
import { isAPIProviderConfig } from "@/types/config/provider"
import { selectionToolbarCustomActionSchema } from "@/types/config/selection-toolbar"
import { findSelectionToolbarAction, replaceSelectionToolbarAction } from "@/utils/custom-actions"
import { syncLayoutSampleData } from "@/utils/layout-host/sample"
import { writeConfigAtom } from "./config"

export const patchProviderConfigAtom = atom(
  null,
  async (_get, set, { id, changes }: { id: string; changes: Partial<APIProviderConfig> }) => {
    await set(writeConfigAtom, (current) => {
      const provider = current.providersConfig.find((item) => item.id === id)
      if (!provider || !isAPIProviderConfig(provider)) throw new Error("Provider no longer exists")
      const next = openAIPublicConfigSchema.parse({ ...provider, ...changes, id })
      return {
        providersConfig: current.providersConfig.map((item) => (item.id === id ? next : item)),
      }
    })
  },
)

export const patchActionConfigAtom = atom(
  null,
  async (
    _get,
    set,
    { id, changes }: { id: string; changes: Partial<SelectionToolbarCustomAction> },
  ) => {
    await set(writeConfigAtom, (current) => {
      const action = findSelectionToolbarAction(current.selectionToolbar, id)
      if (!action) throw new Error("Action no longer exists")
      const patched = selectionToolbarCustomActionSchema.parse({ ...action, ...changes, id })
      // The sample data follows the fields: a new field gets a sample value, a
      // removed field's goes. A built-in action's is dropped on replace.
      const next = {
        ...patched,
        sampleData: syncLayoutSampleData(
          patched.sampleData,
          patched.outputSchema,
          current.language.targetCode,
        ),
      }
      return { selectionToolbar: replaceSelectionToolbarAction(current.selectionToolbar, next) }
    })
  },
)
