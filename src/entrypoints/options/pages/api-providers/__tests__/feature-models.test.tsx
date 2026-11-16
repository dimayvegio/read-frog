// @vitest-environment jsdom
import { render, screen, fireEvent, within, waitFor, cleanup } from "@testing-library/react"
import { Provider } from "jotai"
import { afterEach, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { OpenAIFeatureModelsSettings } from "../feature-models"
vi.mock("@/utils/message", () => ({
  sendMessage: async (name: string) => {
    if (name === "getInitialConfig") return { ok: true, config: DEFAULT_CONFIG }
    throw new Error("Unexpected provider operation")
  },
}))
afterEach(cleanup)
it("renders settings and rejects an empty custom draft without resetting other features", async () => {
  render(
    <Provider>
      <OpenAIFeatureModelsSettings />
    </Provider>,
  )
  const selection = screen.getByLabelText("Model selectionTranslate")
  expect(screen.getByText("Model theo tính năng")).toBeTruthy()
  expect(screen.queryByLabelText("Model pronunciation")).toBeNull()
  expect(screen.queryByLabelText("Model audioTranscription")).toBeNull()
  fireEvent.change(selection, { target: { value: "custom" } })
  const row = selection.closest<HTMLDivElement>("div.border-t")!
  expect(within(row).getByPlaceholderText("Model hỗ trợ Responses API")).toBeTruthy()
  fireEvent.click(within(row).getByRole("button", { name: /^Lưu$/ }))
  await waitFor(() => expect(within(row).getByRole("status").textContent).toContain("Chưa lưu"))
  expect(screen.getByLabelText<HTMLSelectElement>("Model webTranslate").value).toBe("default")
})
