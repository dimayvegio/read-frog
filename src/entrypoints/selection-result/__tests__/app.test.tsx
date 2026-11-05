// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { initI18n } from "@/utils/i18n"
import App from "../app"

const { send, translate } = vi.hoisted(() => ({
  send: vi.fn<(...args: any[]) => any>(),
  translate: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("@/utils/message", () => ({ sendMessage: send }))
vi.mock("@/utils/selection-result/translate", () => ({ translateNativeSelection: translate }))
vi.mock("@/utils/config/storage", () => ({
  getLocalConfig: async () => structuredClone(DEFAULT_CONFIG),
}))
vi.mock("@/components/ui/selection-popover/copy-button", () => ({
  CopyButton: () => <button type="button">Copy</button>,
}))
vi.mock("@/components/ui/selection-popover/speak-button", () => ({
  SpeakButton: () => <button type="button">Speak</button>,
}))
vi.mock("@/components/thinking", () => ({ Thinking: () => null }))
vi.mock(
  "@/entrypoints/content-runtime/selection/selection-toolbar/translate-button/target-language-selector",
  () => ({ TargetLanguageSelector: () => null }),
)
vi.mock("@/components/ui/selection-popover/selection-toolbar-footer-content", () => ({
  SelectionToolbarFooterContent: ({ onRegenerate }: { onRegenerate: () => void }) => (
    <button type="button" aria-label="action.regenerate" onClick={onRegenerate}>
      Retry
    </button>
  ),
}))
vi.mock("@/components/language-combobox", () => ({
  LanguageCombobox: ({ value, onValueChange }: any) => (
    <select
      aria-label="Target language"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="vie">Vietnamese</option>
      <option value="eng">English</option>
      <option value="cmn">Chinese</option>
    </select>
  ),
}))

describe("native selection result window", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await initI18n("en")
    history.replaceState(null, "", "/selection-result.html?sourceTabId=4")
    send.mockResolvedValue({
      id: "first",
      text: "Selected PDF paragraph",
      tooLong: false,
      createdAt: Date.now(),
    })
    translate.mockImplementation(() => new Promise(() => {}))
  })
  afterEach(cleanup)

  it("streams the chosen paragraph and renders output as text", async () => {
    render(<App />)
    await waitFor(() => expect(translate).toHaveBeenCalledOnce())
    const request = translate.mock.calls[0]?.[0]
    expect(request.text).toBe("Selected PDF paragraph")
    await act(() =>
      request.onChunk({
        output: "<script>plain PDF translation</script>",
        thinking: { status: "complete", text: "" },
      }),
    )
    const output = screen.getByTestId("native-selection-output")
    expect(output.textContent).toContain("<script>plain PDF translation</script>")
    expect(output.querySelector("script")).toBeNull()
  })

  it("aborts the previous stream when another passage is selected", async () => {
    render(<App />)
    await waitFor(() => expect(translate).toHaveBeenCalledOnce())
    const previous = translate.mock.calls[0]?.[0]
    send.mockResolvedValue({
      id: "second",
      text: "Another PDF paragraph",
      tooLong: false,
      createdAt: Date.now(),
    })
    await act(() => browser.storage.session.set({ "native-selection:4": { id: "second" } }))
    await waitFor(() => expect(translate).toHaveBeenCalledTimes(2))
    expect(previous.signal.aborted).toBe(true)
    await act(() =>
      previous.onChunk({ output: "Stale result", thinking: { status: "complete", text: "" } }),
    )
    expect(screen.getByTestId("native-selection-output").textContent).not.toContain("Stale result")
    expect(screen.getByText("Another PDF paragraph")).toBeDefined()
  })

  it("stops the stream and retries with a fresh snapshot", async () => {
    render(<App />)
    await waitFor(() => expect(translate).toHaveBeenCalledOnce())
    const previous = translate.mock.calls[0]?.[0]
    fireEvent.click(screen.getByRole("button", { name: "selectionResult.stop" }))
    expect(previous.signal.aborted).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "action.regenerate" }))
    await waitFor(() => expect(translate).toHaveBeenCalledTimes(2))
    expect(translate.mock.calls[1]?.[0].signal.aborted).toBe(false)
  })

  it("does not translate a selection that exceeds the limit", async () => {
    send.mockResolvedValue({ id: "long", text: "", tooLong: true, createdAt: Date.now() })
    render(<App />)
    await screen.findByRole("alert")
    expect(translate).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toBe("selectionResult.tooLong")
  })

  it("does not translate when a selection expired", async () => {
    send.mockResolvedValue(null)
    render(<App />)
    expect((await screen.findByRole("status")).textContent).toBe("selectionResult.empty")
    expect(translate).not.toHaveBeenCalled()
  })

  it("aborts on window teardown", async () => {
    const view = render(<App />)
    await waitFor(() => expect(translate).toHaveBeenCalledOnce())
    const previous = translate.mock.calls[0]?.[0]
    view.unmount()
    expect(previous.signal.aborted).toBe(true)
  })
})
