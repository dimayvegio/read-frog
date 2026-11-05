// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { NO_TRANSLATION_SENTINEL } from "@/utils/constants/prompt"
import {
  translateTextForPage,
  translateTextForPageTitle,
  translateTextForInput,
} from "@/utils/host/translate/translate-variants"
const mocks = vi.hoisted(() => ({
  config: vi.fn<(...args: any[]) => any>(),
  send: vi.fn<(...args: any[]) => any>(),
  detect: vi.fn<(...args: any[]) => any>(),
  context: vi.fn<(...args: any[]) => any>(),
  summary: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("@/utils/config/storage", () => ({ getLocalConfig: mocks.config }))
vi.mock("@/utils/message", () => ({ sendMessage: mocks.send }))
vi.mock("@/utils/content/language", () => ({ detectLanguage: mocks.detect }))
vi.mock("@/utils/glossary/active-matcher", () => ({
  resolveGlossaryTerms: async () => ({ terms: [], revision: 0 }),
}))
vi.mock("@/utils/prompts/translate", () => ({
  getTranslatePrompt: async () => ({ systemPrompt: "Translate", prompt: "input" }),
}))
vi.mock("@/utils/host/translate/webpage-context", () => ({
  getOrCreateWebPageContext: mocks.context,
}))
vi.mock("@/utils/host/translate/webpage-summary", () => ({
  getOrGenerateWebPageSummary: mocks.summary,
}))
let config = structuredClone(DEFAULT_CONFIG)
beforeEach(() => {
  vi.clearAllMocks()
  config = structuredClone(DEFAULT_CONFIG)
  mocks.config.mockResolvedValue(config)
  mocks.send.mockResolvedValue("translated")
  mocks.detect.mockResolvedValue(null)
  mocks.context.mockResolvedValue({
    webTitle: "Title",
    webDescription: "Description",
    webContent: "Article",
  })
  mocks.summary.mockResolvedValue("Summary")
})
const requests = () => mocks.send.mock.calls.filter(([name]) => name === "enqueueTranslateRequest")
describe("OpenAI page and input requests", () => {
  it("carries the captured public profile and HTML format", async () => {
    expect(await translateTextForPage("Hello", "html")).toBe("translated")
    expect(requests()[0]![1]).toMatchObject({
      text: "Hello",
      textFormat: "html",
      providerRef: { kind: "local", config: config.providersConfig[0] },
    })
  })
  it("keeps force retranslation explicit", async () => {
    await translateTextForPage("Hello", "plain", { forceRetranslation: true })
    expect(requests()[0]![1]).toMatchObject({ forceRetranslation: true })
  })
  it.each(["", "   ", "\u200B"])("skips empty prepared text", async (text) => {
    expect(await translateTextForPage(text)).toBe("")
    expect(requests()).toHaveLength(0)
  })
  it("maps only a complete no-translation sentinel to empty", async () => {
    mocks.send.mockResolvedValueOnce(NO_TRANSLATION_SENTINEL)
    expect(await translateTextForPage("Hello")).toBe("")
    mocks.send.mockResolvedValueOnce("prefix " + NO_TRANSLATION_SENTINEL)
    expect(await translateTextForPage("Hello")).toContain("prefix")
  })
  it("skips target-language prose through local detection", async () => {
    mocks.detect.mockResolvedValue(config.language.targetCode)
    expect(
      await translateTextForPage(
        "A sufficiently long paragraph that is already in the target language and should not be translated again.",
      ),
    ).toBe("")
    expect(requests()).toHaveLength(0)
    expect(mocks.detect).toHaveBeenCalledWith(expect.any(String), { enableLLM: false })
  })
  it("changes cache identity when model or effective params change, and ignores a label edit", async () => {
    await translateTextForPage("Hello")
    const first = requests()[0]![1].hash
    config.providersConfig[0]!.name = "Renamed"
    await translateTextForPage("Hello")
    expect(requests()[1]![1].hash).toBe(first)
    config.providersConfig[0]!.temperature = 0.2
    await translateTextForPage("Hello")
    expect(requests()[2]![1].hash).not.toBe(first)
  })
  it("carries smart context and degrades an optional failed summary", async () => {
    config.pageTranslation.enableAIContentAware = true
    mocks.summary.mockRejectedValue(new Error("Unavailable"))
    expect(await translateTextForPageTitle("Original title")).toBe("translated")
    expect(requests()[0]![1]).toMatchObject({ webTitle: "Original title", webContent: "Article" })
    expect(requests()[0]![1].webSummary).toBeUndefined()
  })
  it("uses the resolved input direction with the same public snapshot", async () => {
    const resolved = vi.fn<(...args: any[]) => any>()
    expect(await translateTextForInput("Hello", "eng", "jpn", resolved)).toBe("translated")
    expect(resolved).toHaveBeenCalledWith("jpn")
    expect(requests()[0]![1]).toMatchObject({
      langConfig: { sourceCode: "eng", targetCode: "jpn" },
      providerRef: { kind: "local", config: config.providersConfig[0] },
    })
  })
})
