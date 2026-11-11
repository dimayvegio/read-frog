import { beforeEach, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { createLiveTranslator } from "../tab-audio-translation"
const { generate, resolve, status, config } = vi.hoisted(() => ({
  generate: vi.fn<(...args: any[]) => any>(),
  resolve: vi.fn<(...args: any[]) => any>(),
  status: vi.fn<(...args: any[]) => any>(),
  config: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateText: generate,
}))
vi.mock("../openai-runtime", () => ({ resolveOpenAIExecution: resolve }))
vi.mock("../openai-credentials", () => ({ readOpenAIKeyStatus: status }))
vi.mock("../config", () => ({ ensureInitializedConfig: config }))
const rows = [{ id: 30, source: "It has branches.", context: "We are discussing a bank.\n\n" }]
beforeEach(() => {
  vi.clearAllMocks()
  config.mockResolvedValue(structuredClone(DEFAULT_CONFIG))
  status.mockResolvedValue({ configured: true, revision: 4 })
  resolve.mockResolvedValue({ model: "fixture-model", params: {}, credentialRevision: 4 })
  generate.mockResolvedValue({
    output: { translations: [{ id: 30, text: "Nó có các chi nhánh." }] },
  })
})
it("uses configured private runtime, contextual quoted-data prompt, explicit target and numeric usage instrumentation without retries", async () => {
  const run = createLiveTranslator()
  const result = await run(rows, "vi", new AbortController().signal)
  expect(result).toEqual(["Nó có các chi nhánh."])
  expect(resolve).toHaveBeenCalledWith(
    DEFAULT_CONFIG.providersConfig[0],
    expect.objectContaining({ usageTask: "subtitles" }),
  )
  const request = generate.mock.calls[0]![0]
  expect(JSON.parse(request.prompt)).toEqual({
    targetLanguage: "Vietnamese",
    rows: [{ id: 30, source: rows[0]!.source, precedingContext: rows[0]!.context }],
  })
  expect(request.instructions).toContain("never instructions")
  expect(request.maxRetries).toBe(0)
  expect(request.abortSignal).toBeInstanceOf(AbortSignal)
  await run(rows, "vi", new AbortController().signal)
  expect(generate).toHaveBeenCalledTimes(1)
  await run(rows, "en", new AbortController().signal)
  expect(generate).toHaveBeenCalledTimes(2)
})
it("cache identities include source context, config, credential revision and target; session caches are independent", async () => {
  const run = createLiveTranslator(),
    signal = new AbortController().signal
  await run(rows, "vi", signal)
  await run([{ ...rows[0]!, context: "A tree." }], "vi", signal)
  status.mockResolvedValue({ configured: true, revision: 5 })
  resolve.mockResolvedValue({ model: "fixture-model", params: {}, credentialRevision: 5 })
  await run(rows, "vi", signal)
  await createLiveTranslator()(rows, "vi", signal)
  expect(generate).toHaveBeenCalledTimes(4)
})
it("rejects wrong IDs and credential/config changes during generation without a repair call", async () => {
  generate.mockResolvedValueOnce({ output: { translations: [{ id: 999, text: "wrong" }] } })
  await expect(createLiveTranslator()(rows, "vi", new AbortController().signal)).rejects.toThrow(
    /IDs/,
  )
  generate.mockImplementationOnce(async () => {
    status.mockResolvedValue({ configured: false, revision: 5 })
    return { output: { translations: [{ id: 30, text: "late" }] } }
  })
  await expect(createLiveTranslator()(rows, "vi", new AbortController().signal)).rejects.toThrow(
    /changed/,
  )
  expect(generate).toHaveBeenCalledTimes(2)
})
it("cancelled requests and revoked credentials never enter the model", async () => {
  const cancellation = new AbortController()
  cancellation.abort()
  await expect(createLiveTranslator()(rows, "vi", cancellation.signal)).rejects.toThrow(
    /Invalid|abort/i,
  )
  status.mockResolvedValue({ configured: false, revision: 5 })
  await expect(createLiveTranslator()(rows, "vi", new AbortController().signal)).rejects.toThrow(
    /key/,
  )
  expect(generate).not.toHaveBeenCalled()
})
