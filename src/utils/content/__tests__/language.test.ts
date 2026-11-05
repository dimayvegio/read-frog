import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_OPENAI_CONFIG } from "@/types/config/openai"
import { detectLanguageWithSource } from "../language"
const mocks = vi.hoisted(() => ({
  franc: vi.fn<(...args: any[]) => any>(),
  send: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("franc", () => ({ franc: mocks.franc }))
vi.mock("@/utils/message", () => ({ sendMessage: mocks.send }))
const text = "This is enough sample text for language detection."
beforeEach(() => {
  vi.clearAllMocks()
  mocks.franc.mockReturnValue("eng")
})
describe("language detection with local fallback", () => {
  it("uses local detection without OpenAI in basic mode", async () => {
    expect(await detectLanguageWithSource(text)).toEqual({ code: "eng", source: "franc" })
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it("accepts a valid OpenAI answer from the supplied public snapshot", async () => {
    mocks.send.mockResolvedValue({ text: JSON.stringify({ code: "jpn" }) })
    expect(
      await detectLanguageWithSource(text, {
        enableLLM: true,
        providerRef: { kind: "local", config: DEFAULT_OPENAI_CONFIG },
      }),
    ).toEqual({ code: "jpn", source: "llm" })
  })
  it("keeps speech usable when an OpenAI key is missing or the request fails", async () => {
    mocks.send.mockRejectedValue(new Error("Configure an OpenAI API key"))
    expect(
      await detectLanguageWithSource(text, {
        enableLLM: true,
        llmFallbackToastContext: "speak",
        providerRef: { kind: "local", config: DEFAULT_OPENAI_CONFIG },
      }),
    ).toEqual({ code: "eng", source: "franc" })
  })
  it("falls back to und for an unsupported local language", async () => {
    mocks.franc.mockReturnValue("vmw")
    expect(await detectLanguageWithSource(text)).toEqual({ code: "und", source: "fallback" })
  })
})
