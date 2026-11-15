import { afterEach, beforeEach, expect, it, vi } from "vitest"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
import { aiCacheDB, clearAiCache } from "@/utils/ai-cache/db"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { translateNativeSelection } from "../translate"
const h = vi.hoisted(() => ({
  config: null as any,
  revision: 1,
  terms: [] as any[],
  stream: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("@/utils/config/storage", () => ({ getLocalConfig: async () => h.config }))
vi.mock("@/utils/message", () => ({
  sendMessage: async (name: string) =>
    name === "getGlossarySnapshot"
      ? { entries: h.terms, revision: 1 }
      : { configured: true, revision: h.revision },
}))
vi.mock("@/utils/content-script/background-stream-client", () => ({
  streamBackgroundText: h.stream,
}))
const controllers: AbortController[] = []
function run(extra: Record<string, unknown> = {}) {
  const c = new AbortController()
  controllers.push(c)
  return translateNativeSelection({
    text: "Read this HTML paragraph.",
    sourceKind: "web",
    config: h.config,
    signal: c.signal,
    onChunk: () => {},
    ...extra,
  })
}
beforeEach(async () => {
  h.config = structuredClone(DEFAULT_CONFIG)
  h.config.glossary.enabled = false
  h.revision = 1
  h.terms = []
  h.stream
    .mockReset()
    .mockResolvedValue({ output: "Bản dịch hoàn tất", thinking: { status: "complete", text: "" } })
  await clearAiCache()
})
afterEach(() => {
  for (const c of controllers.splice(0)) c.abort()
})
it("reuses completed HTML translation across requests and cache-only reads without PDF history", async () => {
  await run()
  const state = vi.fn<(...args: any[]) => any>()
  expect((await run({ onCacheState: state })).output).toBe("Bản dịch hoàn tất")
  expect((await run({ cacheOnly: true })).output).toBe("Bản dịch hoàn tất")
  expect(h.stream).toHaveBeenCalledOnce()
  expect(state).toHaveBeenCalledWith("cached", expect.stringContaining("không gọi API"))
  expect(await aiCacheDB.completions.count()).toBe(1)
})
it("explicit regenerate bypasses once and replaces the reusable completed result", async () => {
  await run()
  h.stream.mockResolvedValue({ output: "Bản mới", thinking: null })
  await run({ bypassCache: true })
  expect((await run()).output).toBe("Bản mới")
  expect(h.stream).toHaveBeenCalledTimes(2)
})
it.each(["language", "model", "prompt", "key", "glossary", "clear"])(
  "does not reuse the old output after %s changes",
  async (kind) => {
    await run()
    if (kind === "language") h.config.language.targetCode = "ja"
    if (kind === "model")
      h.config.providersConfig[0].model.model =
        h.config.providersConfig[0].model.model === "gpt-4o-mini" ? "gpt-4o" : "gpt-4o-mini"
    if (kind === "prompt")
      h.config.pageTranslation.customPromptsConfig = {
        promptId: "test",
        patterns: [
          {
            id: "test",
            name: "test",
            systemPrompt: "Keep legal terminology precise.",
            prompt: "{{input}}",
          },
        ],
      }
    if (kind === "key") h.revision++
    if (kind === "glossary") {
      h.config.glossary.enabled = true
      h.terms = [{ matchKey: "html", source: "HTML", target: "Hypertext", caseSensitive: true }]
    }
    if (kind === "clear") await clearAiCache()
    await run()
    expect(h.stream).toHaveBeenCalledTimes(2)
  },
)
it("never saves an aborted fragment as a finished translation", async () => {
  const c = new AbortController()
  controllers.push(c)
  h.stream.mockImplementation(async (_payload, opts) => {
    opts.onChunk({ output: "Partial", thinking: null })
    c.abort()
    return { output: "Partial", thinking: null }
  })
  await expect(run({ signal: c.signal })).rejects.toMatchObject({ name: "AbortError" })
  expect(await aiCacheDB.completions.count()).toBe(0)
  h.stream.mockResolvedValue({ output: "Complete", thinking: null })
  expect((await run()).output).toBe("Complete")
  expect(h.stream).toHaveBeenCalledTimes(2)
})

it.each(["prompt", "clear"])(
  "rejects late output when %s changes during translation",
  async (kind) => {
    h.stream.mockImplementation(async () => {
      if (kind === "clear") await clearAiCache()
      else h.config.pageTranslation.customPromptsConfig.promptId = "changed-while-pending"
      return { output: "Stale completion", thinking: null }
    })
    await expect(run()).rejects.toMatchObject({ name: "AbortError" })
    expect(await aiCacheDB.completions.count()).toBe(0)
    expect(h.stream).toHaveBeenCalledOnce()
  },
)
