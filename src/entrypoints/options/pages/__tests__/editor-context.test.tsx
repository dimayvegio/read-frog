import type { Config as SeedConfig } from "@/types/config/config"
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { describe, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { configAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { getBuiltInDictionaryAction } from "@/utils/custom-actions"
import {
  ActionEditor,
  BuiltInActionEditor,
  CustomActionEditor,
  useActionEditor,
} from "../custom-actions/action-config-form/action-editor"

function seedConfig(store: ReturnType<typeof createStore>, config: SeedConfig) {
  void fakeBrowser.storage.local.set({ config })
  store.set(configAtom, config)
}

function DeleteActionProbe() {
  const deleteAction = useActionEditor().actions.delete
  if (!deleteAction) {
    throw new Error("Expected custom action delete command")
  }

  return (
    <button type="button" onClick={() => void deleteAction()}>
      Delete action
    </button>
  )
}

function createConfigStore() {
  const store = createStore()
  seedConfig(store, structuredClone(DEFAULT_CONFIG))
  return store
}

describe("editor compound component contexts", () => {
  it("fails fast when Delete is composed for a built-in action", () => {
    const store = createConfigStore()
    const action = getBuiltInDictionaryAction(store.get(configAtom).selectionToolbar)

    expect(() =>
      render(
        <Provider store={store}>
          <BuiltInActionEditor.Provider action={action}>
            <ActionEditor.DeleteButton />
          </BuiltInActionEditor.Provider>
        </Provider>,
      ),
    ).toThrow("ActionEditor.delete is unavailable in this composition")
  })

  it("deletes the selected custom action without changing retained actions", async () => {
    const store = createConfigStore()
    const config = structuredClone(store.get(configAtom))
    const action = {
      id: "note-suggestion-action",
      name: "Note suggestion Action",
      enabled: false,
      icon: "tabler:sparkles",
      providerId: config.selectionToolbar.builtInActions.dictionary.providerId,
      systemPrompt: "System prompt",
      prompt: "Prompt",
      outputSchema: [
        {
          id: "result",
          name: "result",
          type: "string" as const,
          description: "Result",
        },
      ],
    }
    config.selectionToolbar.customActions = [action]
    seedConfig(store, config)

    render(
      <Provider store={store}>
        <CustomActionEditor.Provider action={action}>
          <DeleteActionProbe />
        </CustomActionEditor.Provider>
      </Provider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Delete action" }))

    await waitFor(() => {
      const selectionToolbar = store.get(configAtom).selectionToolbar
      expect(selectionToolbar.customActions).toEqual([])
    })
  })
})

function ActionContextProbe() {
  useActionEditor()
  return null
}

it("requires the action editor context", () => {
  expect(() => render(<ActionContextProbe />)).toThrow(
    "ActionEditor components must be rendered inside an ActionEditor Provider",
  )
})
