import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_OPENAI_CONFIG } from "@/types/config/openai"
import {
  runGenerateTextInBackground,
  setupLLMGenerateTextMessageHandlers,
} from "../llm-generate-text"
const mocks = vi.hoisted(() => ({
  onMessage: vi.fn<(...args: any[]) => any>(),
  generate: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("@/utils/message", () => ({ onMessage: mocks.onMessage }))
vi.mock("../background-stream", () => ({ generateTextForProviderRef: mocks.generate }))
const payload = {
  providerRef: { kind: "local" as const, config: DEFAULT_OPENAI_CONFIG },
  instructions: "System",
  prompt: "Example",
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.generate.mockResolvedValue("eng")
})
describe("strict generation message", () => {
  it("passes a complete public snapshot to the background runtime", async () => {
    expect(await runGenerateTextInBackground(payload)).toEqual({ text: "eng" })
    expect(mocks.generate).toHaveBeenCalledWith(payload)
  })
  it("rejects detached overrides and obsolete routes before execution", async () => {
    setupLLMGenerateTextMessageHandlers()
    const handler = mocks.onMessage.mock.calls[0]![1]
    for (const data of [
      { ...payload, apiKey: "sentinel" },
      { ...payload, hostedFeature: "pageTranslation" },
      { ...payload, providerRef: { kind: "system", providerId: "read-frog-free-ai" } },
    ])
      await expect(handler({ data })).rejects.toThrow("Unable to complete")
    expect(mocks.generate).not.toHaveBeenCalled()
  })
  it("does not transmit raw SDK causes, headers or bodies", async () => {
    mocks.generate.mockRejectedValue(
      Object.assign(new Error("key-sentinel"), {
        requestHeaders: { Authorization: "key-sentinel" },
      }),
    )
    setupLLMGenerateTextMessageHandlers()
    const handler = mocks.onMessage.mock.calls[0]![1]
    const error = await handler({ data: payload }).catch((failure: unknown) => failure)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toHaveProperty("cause")
    expect(String(error)).not.toContain("key-sentinel")
  })
})
