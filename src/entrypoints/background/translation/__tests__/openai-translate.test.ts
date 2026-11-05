import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_OPENAI_CONFIG } from "@/types/config/openai"
import { getRequestErrorMeta } from "@/utils/request/retry-policy"
import { aiTranslate } from "../openai-translate"

const mocks = vi.hoisted(() => ({
  generate: vi.fn<(...args: any[]) => any>(),
  resolve: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("ai", () => ({ generateText: mocks.generate }))
vi.mock("../../openai-runtime", () => ({ resolveOpenAIExecution: mocks.resolve }))
const prompt = vi.fn<(...args: any[]) => any>(async () => ({
  systemPrompt: "system",
  prompt: "prompt",
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolve.mockResolvedValue({
    model: "captured-model",
    params: { temperature: 0.3, reasoning: "low" },
  })
})

describe("OpenAI page executor", () => {
  it.each([
    ["plain answer", "plain answer"],
    ["<think>internal</think>final answer", "final answer"],
  ])("preserves response normalization", async (response, expected) => {
    mocks.generate.mockResolvedValueOnce({ text: response })
    expect(await aiTranslate("sample", "Vietnamese", DEFAULT_OPENAI_CONFIG, prompt)).toBe(expected)
  })
  it("uses one supplied snapshot and keeps context/glossary/cancellation", async () => {
    const signal = new AbortController().signal
    const terms = [{ source: "test", target: "sample" }]
    mocks.generate.mockResolvedValueOnce({ text: "answer" })
    await aiTranslate("sample", "Vietnamese", DEFAULT_OPENAI_CONFIG, prompt, {
      signal,
      isBatch: true,
      context: { title: "sample" },
      glossaryTerms: terms as never,
    })
    expect(mocks.resolve).toHaveBeenCalledWith(DEFAULT_OPENAI_CONFIG, { signal })
    expect(prompt).toHaveBeenCalledWith(
      "Vietnamese",
      "sample",
      expect.objectContaining({ isBatch: true, glossaryTerms: terms, signal }),
    )
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "captured-model",
        temperature: 0.3,
        reasoning: "low",
        maxRetries: 0,
        abortSignal: signal,
      }),
    )
  })
  it("preserves retry metadata while excluding raw SDK request/response data", async () => {
    mocks.generate.mockRejectedValueOnce(
      Object.assign(new Error("private-sentinel"), {
        statusCode: 429,
        isRetryable: true,
        responseHeaders: { "retry-after": "2" },
        requestBodyValues: { apiKey: "private-sentinel" },
      }),
    )
    const error = await aiTranslate("sample", "Vietnamese", DEFAULT_OPENAI_CONFIG, prompt).catch(
      (value: unknown) => value,
    )
    expect(getRequestErrorMeta(error)).toMatchObject({
      statusCode: 429,
      retryAfterMs: 2000,
      kind: "rate-limit",
      isRetryable: true,
    })
    expect(String(error)).not.toContain("private-sentinel")
    expect(error).not.toHaveProperty("requestBodyValues")
  })
})
