// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { Provider, createStore } from "jotai"
import { describe, expect, it, vi } from "vitest"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { LanguageDetectionConfig } from ".."
vi.mock("@/utils/atoms/config", async () => {
  const { atom } = await vi.importActual<typeof import("jotai")>("jotai")
  return {
    configFieldsAtomMap: { languageDetection: atom({ mode: "basic", providerId: undefined }) },
  }
})
function setup(mode: "basic" | "llm") {
  const store = createStore()
  void store.set(configFieldsAtomMap.languageDetection, { mode, providerId: "openai-default" })
  render(
    <Provider store={store}>
      <LanguageDetectionConfig />
    </Provider>,
  )
  return store
}
describe("LanguageDetectionConfig", () => {
  it("offers OpenAI detection while keeping local detection available", () => {
    const store = setup("basic")
    expect(screen.getByRole("radio", { name: "Local" })).toBeChecked()
    fireEvent.click(screen.getByRole("radio", { name: "OpenAI" }))
    expect(store.get(configFieldsAtomMap.languageDetection)).toEqual({
      mode: "llm",
      providerId: "openai-default",
    })
  })
  it("can return to local detection and explains the speech fallback", () => {
    const store = setup("llm")
    expect(screen.getByRole("radio", { name: "OpenAI" })).toBeChecked()
    expect(screen.getByText(/falls back locally/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: "Local" }))
    expect(store.get(configFieldsAtomMap.languageDetection).mode).toBe("basic")
  })
})
