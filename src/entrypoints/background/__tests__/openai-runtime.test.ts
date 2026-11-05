import { generateText } from "ai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_OPENAI_CONFIG } from "@/types/config/openai"
import { openAIOnlyFetch, resolveOpenAIExecution } from "../openai-runtime"

const key = vi.hoisted(() =>
  vi.fn<() => Promise<string | null>>(async () => "test-credential-sentinel"),
)
vi.mock("../openai-credentials", () => ({
  readOpenAIExecutionCredential: async () => ({ apiKey: await key(), revision: 7 }),
}))
vi.mock("../config", () => ({
  ensureInitializedConfig: vi.fn<() => Promise<void>>(async () => {}),
}))

afterEach(() => {
  vi.restoreAllMocks()
  key.mockReset()
  key.mockResolvedValue("test-credential-sentinel")
})

describe("background OpenAI runtime", () => {
  it.each([
    ["http://api.openai.com/v1/responses", "POST"],
    ["https://api.openai.com.evil/v1/responses", "POST"],
    ["https://api.openai.com/v1/models", "POST"],
    ["https://api.openai.com/v1/responses", "GET"],
    ["https://api.openai.com/v1/responses?redirect=elsewhere", "POST"],
  ])("blocks unauthorized destination/method before fetch", async (url, method) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    await expect(openAIOnlyFetch(url, { method })).rejects.toThrow("OpenAI endpoint is not allowed")
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it("executes the pinned SDK against Responses using the supplied model and params", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "resp_test",
          object: "response",
          created_at: 1,
          status: "completed",
          model: "gpt-4o-mini",
          output: [
            {
              id: "msg_test",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                { type: "output_text", text: "sample answer", annotations: [], logprobs: [] },
              ],
            },
          ],
          usage: {
            input_tokens: 2,
            output_tokens: 2,
            total_tokens: 4,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 },
          },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    )
    const snapshot = {
      ...DEFAULT_OPENAI_CONFIG,
      model: { ...DEFAULT_OPENAI_CONFIG.model, model: "gpt-4o-mini" as const },
      reasoning: "low" as const,
      temperature: 0.4,
    }
    const execution = await resolveOpenAIExecution(snapshot)
    expect(execution.params).toMatchObject({ reasoning: "low", temperature: 0.4 })
    const result = await generateText({
      model: execution.model,
      ...execution.params,
      prompt: "test sample",
      maxRetries: 0,
    })
    expect(result.text).toBe("sample answer")
    const [request, options] = fetchSpy.mock.calls[0]!
    expect(request).toBeInstanceOf(Request)
    const sent = request as Request
    expect(sent.url).toBe("https://api.openai.com/v1/responses")
    expect(sent.method).toBe("POST")
    expect(JSON.parse(await sent.clone().text()).model).toBe("gpt-4o-mini")
    expect(options).toMatchObject({ credentials: "omit", redirect: "error" })
    expect(fetchSpy).toHaveBeenCalledOnce()
  })
  it("does not fetch when credential is missing or cancellation happens during credential IO", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    key.mockResolvedValueOnce(null)
    await expect(resolveOpenAIExecution(DEFAULT_OPENAI_CONFIG)).rejects.toThrow(
      "Configure an OpenAI API key",
    )
    const controller = new AbortController()
    key.mockImplementationOnce(async () => {
      controller.abort()
      return "late-credential"
    })
    await expect(
      resolveOpenAIExecution(DEFAULT_OPENAI_CONFIG, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it("rejects secret overrides before accessing credential storage", async () => {
    await expect(
      resolveOpenAIExecution({ ...DEFAULT_OPENAI_CONFIG, apiKey: "public-sentinel" }),
    ).rejects.toThrow("Unrecognized key")
    expect(key).not.toHaveBeenCalled()
  })
})
