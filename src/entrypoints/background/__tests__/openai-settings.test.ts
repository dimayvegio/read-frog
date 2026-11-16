import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { DEFAULT_OPENAI_CONFIG } from "@/types/config/openai"
import { setupOpenAISettingsHandlers } from "../openai-settings"

type Handler = (message: { data?: unknown; sender: Record<string, unknown> }) => Promise<unknown>
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  ready: vi.fn<() => Promise<void>>(),
  save: vi.fn<(key: string) => Promise<unknown>>(),
  remove: vi.fn<() => Promise<unknown>>(),
  status: vi.fn<() => Promise<unknown>>(),
  credential: vi.fn<() => Promise<unknown>>(),
  execution: vi.fn<() => Promise<unknown>>(),
  generate: vi.fn<() => Promise<unknown>>(),
}))
vi.mock("@/utils/message", () => ({
  onMessage: (name: string, handler: Handler) => mocks.handlers.set(name, handler),
}))
vi.mock("../config", () => ({
  ensureInitializedConfig: mocks.ready,
  getInitialConfig: vi.fn<() => Promise<unknown>>(),
}))
vi.mock("../openai-credentials", () => ({
  saveOpenAIKey: mocks.save,
  deleteOpenAIKey: mocks.remove,
  readOpenAIKeyStatus: mocks.status,
  readOpenAIExecutionCredential: mocks.credential,
}))
vi.mock("../openai-runtime", () => ({ resolveOpenAIExecution: mocks.execution }))
vi.mock("ai", () => ({ generateText: mocks.generate }))

function sender() {
  return { id: browser.runtime.id, url: browser.runtime.getURL("/options.html"), frameId: 0 }
}
afterEach(() => vi.restoreAllMocks())
beforeEach(() => {
  vi.clearAllMocks()
  mocks.handlers.clear()
  mocks.ready.mockResolvedValue()
  mocks.status.mockResolvedValue({ configured: true, revision: 5, requiresReentry: false })
  mocks.execution.mockResolvedValue({ model: {}, params: {}, credentialRevision: 6 })
  mocks.generate.mockResolvedValue({ text: "OK" })
  setupOpenAISettingsHandlers()
})

describe("privileged settings messages", () => {
  it("rejects website and content senders before privileged IO", async () => {
    for (const name of [
      "saveOpenAIKey",
      "deleteOpenAIKey",
      "testOpenAIConnection",
      "fetchOpenAILiveModels",
    ]) {
      await expect(
        mocks.handlers.get(name)!({
          sender: { ...sender(), url: "https://example.com/options.html" },
          data: { key: "test-sentinel" },
        }),
      ).rejects.toThrow("requires the extension settings page")
    }
    expect(mocks.ready).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.execution).not.toHaveBeenCalled()
    expect([...mocks.handlers.keys()]).not.toContain("getOpenAIKey")
  })
  it("saves only from settings, returning status without echoing input", async () => {
    mocks.save.mockResolvedValue({ configured: true, revision: 7, requiresReentry: false })
    const result = await mocks.handlers.get("saveOpenAIKey")!({
      sender: sender(),
      data: { key: "test-sentinel" },
    })
    expect(mocks.save).toHaveBeenCalledWith("test-sentinel")
    expect(JSON.stringify(result)).not.toContain("test-sentinel")
  })
  it("binds the connection result to the credential revision used by execution", async () => {
    expect(
      await mocks.handlers.get("testOpenAIConnection")!({
        sender: sender(),
        data: DEFAULT_OPENAI_CONFIG,
      }),
    ).toMatchObject({ ok: true, credentialRevision: 6 })
  })
  it.each([
    [401, "AUTHENTICATION_FAILED"],
    [429, "RATE_LIMITED"],
    [500, "CONNECTION_FAILED"],
  ])("sanitizes connection error %s", async (statusCode, code) => {
    mocks.generate.mockRejectedValue(Object.assign(new Error("secret-sentinel"), { statusCode }))
    const result = await mocks.handlers.get("testOpenAIConnection")!({
      sender: sender(),
      data: DEFAULT_OPENAI_CONFIG,
    })
    expect(result).toMatchObject({ ok: false, code })
    expect(JSON.stringify(result)).not.toContain("secret-sentinel")
  })
  it("fetches and filters live models when authorized", async () => {
    mocks.credential.mockResolvedValue({ apiKey: "sk-test", revision: 1 })
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            { id: "gpt-4o" },
            { id: "gpt-4o-mini" },
            { id: "whisper-1" },
            { id: "dall-e-3" }, // filtered out
            { id: "text-embedding-ada-002" }, // filtered out
          ],
        }),
        { status: 200 },
      ),
    )
    const result = (await mocks.handlers.get("fetchOpenAILiveModels")!({
      sender: sender(),
    })) as { ok: boolean; models: string[] }
    expect(result.ok).toBe(true)
    expect(result.models).toEqual(["gpt-4o", "gpt-4o-mini", "whisper-1"])
    fetchSpy.mockRestore()
  })
  it("does not return a catalog belonging to a key replaced during the request", async () => {
    mocks.credential
      .mockResolvedValueOnce({ apiKey: "sk-sentinel", revision: 1 })
      .mockResolvedValueOnce({ apiKey: "sk-new", revision: 2 })
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "gpt-4o" }] })))
    expect(await mocks.handlers.get("fetchOpenAILiveModels")!({ sender: sender() })).toMatchObject({
      ok: false,
      models: [],
    })
    expect(fetchSpy).toHaveBeenCalledOnce()
  })
  it("bounds catalog bodies and sanitizes malformed objects/provider errors", async () => {
    mocks.credential.mockResolvedValue({ apiKey: "sk-sentinel", revision: 1 })
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("secret-sentinel".repeat(100000)))
    const result = await mocks.handlers.get("fetchOpenAILiveModels")!({ sender: sender() })
    expect(result).toMatchObject({ ok: false, models: [] })
    expect(JSON.stringify(result)).not.toContain("sentinel")
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [null, 4, {}, { id: "gpt-4o" }, { id: "gpt-4o" }, { id: "gpt-" + "x".repeat(200) }],
        }),
      ),
    )
    expect(await mocks.handlers.get("fetchOpenAILiveModels")!({ sender: sender() })).toMatchObject({
      ok: true,
      models: ["gpt-4o"],
    })
  })
})
