import { beforeEach, describe, expect, it, vi } from "vitest"
import { storage } from "#imports"
import { DEFAULT_CONFIG, CONFIG_STORAGE_KEY } from "@/utils/constants/config"

vi.unmock("@/utils/config/readiness")
const mocks = vi.hoisted(() => ({
  send: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  generate: vi.fn<(...args: unknown[]) => Promise<{ text: string }>>(),
  execution: vi.fn<(...args: unknown[]) => Promise<{ model: string; params: object }>>(),
}))
vi.mock("@/utils/message", () => ({ sendMessage: mocks.send }))
vi.mock("ai", () => ({ generateText: mocks.generate }))
vi.mock("../openai-runtime", () => ({ resolveOpenAIExecution: mocks.execution }))

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  // runtime.sendMessage does not deliver a message back to its sending context.
  mocks.send.mockRejectedValue(
    new Error("Could not establish connection. Receiving end does not exist."),
  )
  mocks.generate.mockResolvedValue({ text: "Bản dịch thử nghiệm" })
  mocks.execution.mockResolvedValue({ model: "test-model", params: {} })
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, structuredClone(DEFAULT_CONFIG))
})

describe("page translation configuration in the background", () => {
  it("builds batch and individual prompts through the local barrier without messaging itself", async () => {
    const { setBackgroundConfigReadyResolver } = await import("@/utils/config/readiness")
    const { getTranslatePrompt } = await import("@/utils/prompts/translate")
    const { executeTranslate } = await import("../translation/execute-translate")
    let resolveReady!: (config: typeof DEFAULT_CONFIG) => void
    const ready = new Promise<typeof DEFAULT_CONFIG>((resolve) => {
      resolveReady = resolve
    })
    const initialize = vi.fn<() => typeof ready>(() => ready)
    setBackgroundConfigReadyResolver(initialize)

    const translate = (isBatch: boolean) =>
      executeTranslate(
        "The quick brown fox jumps over the lazy dog.",
        { ...DEFAULT_CONFIG.language, targetCode: "vie" },
        DEFAULT_CONFIG.providersConfig[0]!,
        getTranslatePrompt,
        { isBatch, glossaryTerms: [] },
      )
    const batch = translate(true)
    await vi.waitFor(() => expect(initialize).toHaveBeenCalledOnce())
    expect(mocks.generate).not.toHaveBeenCalled()
    resolveReady(DEFAULT_CONFIG)
    await expect(batch).resolves.toBe("Bản dịch thử nghiệm")
    await expect(translate(false)).resolves.toBe("Bản dịch thử nghiệm")
    expect(mocks.generate).toHaveBeenCalledTimes(2)
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.generate.mock.calls[0]?.[0]).toMatchObject({
      prompt: expect.stringContaining("The quick brown fox"),
    })
  })

  it("keeps recovery fail-closed and permits a later successful local initialization", async () => {
    const { awaitConfigReady, setBackgroundConfigReadyResolver } =
      await import("@/utils/config/readiness")
    const initialize = vi
      .fn<() => Promise<typeof DEFAULT_CONFIG>>()
      .mockRejectedValueOnce(new Error("Configuration recovery required: STORAGE_UNAVAILABLE"))
      .mockResolvedValue(DEFAULT_CONFIG)
    setBackgroundConfigReadyResolver(initialize)
    await expect(awaitConfigReady()).rejects.toThrow("STORAGE_UNAVAILABLE")
    await expect(awaitConfigReady()).resolves.toEqual(DEFAULT_CONFIG)
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
