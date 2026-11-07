import { beforeEach, describe, expect, it, vi } from "vitest"
import { MAX_NATIVE_SELECTION_LENGTH } from "@/types/native-selection"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { translateNativeSelection } from "../translate"

const { stream, send } = vi.hoisted(() => ({
  stream: vi.fn<(...args: any[]) => any>(),
  send: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("@/utils/content-script/background-stream-client", () => ({ streamBackgroundText: stream }))
vi.mock("@/utils/message", () => ({ sendMessage: send }))

describe("native PDF selected-text translation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stream.mockResolvedValue({ output: "Bản dịch", thinking: { status: "complete", text: "" } })
    send.mockResolvedValue({ revision: 1, entries: [], scopeKey: "global" })
  })
  it("never dispatches a provider request during a cache-only miss", async () => {
    const config = structuredClone(DEFAULT_CONFIG)
    config.glossary.enabled = false
    const result = await translateNativeSelection({
      text: "Only check local cache.",
      config,
      signal: new AbortController().signal,
      cacheOnly: true,
      onChunk: () => {},
    })
    expect(result.output).toBe("")
    expect(stream).not.toHaveBeenCalled()
  })
  const run = (
    text: string,
    config = structuredClone(DEFAULT_CONFIG),
    controller = new AbortController(),
    onChunk = vi.fn<(...args: any[]) => any>(),
  ) => translateNativeSelection({ text, config, signal: controller.signal, onChunk })

  it("sends only the selection through the existing OpenAI stream, with a public model snapshot", async () => {
    const config = structuredClone(DEFAULT_CONFIG)
    config.language.targetCode = "vie"
    config.glossary.enabled = false
    const result = await run("Only the highlighted paragraph.", config)
    const [payload] = stream.mock.calls[0]!
    expect(payload.prompt).toContain("Only the highlighted paragraph.")
    expect(payload.prompt).toContain("Vietnamese")
    expect(payload.providerConfig).toEqual(config.providersConfig[0])
    expect(payload).not.toHaveProperty("apiKey")
    expect(payload.providerConfig).not.toHaveProperty("apiKey")
    expect(result.output).toBe("Bản dịch")
  })

  it("uses global glossary matches without sending an extension URL or a PDF path", async () => {
    const config = structuredClone(DEFAULT_CONFIG)
    config.glossary.enabled = true
    send.mockResolvedValue({
      revision: 1,
      scopeKey: "global",
      entries: [{ matchKey: "edge", source: "Edge", target: "Edge browser", caseSensitive: true }],
    })
    await run("Edge PDF", config)
    expect(send).toHaveBeenCalledExactlyOnceWith("getGlossarySnapshot", {
      url: undefined,
      targetLang: config.language.targetCode,
    })
    expect(stream.mock.calls[0]?.[0].instructions).toContain("Edge browser")
  })
  it("gives the explicit Vietnamese picker priority over a custom Chinese-only template without a language token", async () => {
    const config = structuredClone(DEFAULT_CONFIG)
    config.language.targetCode = "vie"
    config.glossary.enabled = false
    config.pageTranslation.customPromptsConfig = {
      promptId: "fixed-chinese",
      patterns: [
        {
          id: "fixed-chinese",
          name: "Technical style",
          systemPrompt: "Translate into Chinese. Preserve code and headings.",
          prompt: "{{input}}",
        },
      ],
    }
    await run("使用 semaphore 时需要初始化吗?", config)
    const payload = stream.mock.calls[0]![0]
    expect(payload.instructions).toContain("Preserve code and headings.")
    expect(payload.instructions).toContain("Vietnamese (vie)")
    expect(payload.instructions).toContain("overrides any different target language")
    expect(payload.prompt).toBe("使用 semaphore 时需要初始化吗?")
    expect(config.pageTranslation.customPromptsConfig.patterns[0]!.systemPrompt).toBe(
      "Translate into Chinese. Preserve code and headings.",
    )
  })

  it("aborts before dispatch when cancelled while the glossary is loading", async () => {
    let finish!: (value: unknown) => void
    send.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const config = structuredClone(DEFAULT_CONFIG)
    config.glossary.enabled = true
    const controller = new AbortController()
    const pending = run("PDF text", config, controller)
    controller.abort()
    finish({ entries: [] })
    await expect(pending).rejects.toThrow("aborted")
    expect(stream).not.toHaveBeenCalled()
  })

  it("ignores late chunks from a cancelled selection", async () => {
    const controller = new AbortController()
    const chunk = vi.fn<(...args: any[]) => any>()
    await run("PDF text", undefined, controller, chunk)
    controller.abort()
    stream.mock.calls[0]?.[1].onChunk({ output: "Late result" })
    expect(chunk).not.toHaveBeenCalled()
  })

  it.each(["", " ", "a".repeat(MAX_NATIVE_SELECTION_LENGTH + 1)])(
    "rejects empty or oversized text before any API call",
    async (text) => {
      await expect(run(text)).rejects.toThrow("selection length")
      expect(send).not.toHaveBeenCalled()
      expect(stream).not.toHaveBeenCalled()
    },
  )
})
