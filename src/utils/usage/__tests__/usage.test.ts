import { generateText, streamText } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { instrumentModel, beginUsage } from "@/entrypoints/background/usage"
import { usageDB, usageEpoch, saveUsage, clearUsage } from "../db"
import { estimateUsage, DEFAULT_PRICES, type UsageEntry } from "../schema"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
const usage = {
  inputTokens: { total: 100, noCache: 60, cacheRead: 40, cacheWrite: 0 },
  outputTokens: { total: 50, text: 40, reasoning: 10 },
}
const row = (overrides: Partial<UsageEntry> = {}): UsageEntry => ({
  id: crypto.randomUUID(),
  at: Date.now(),
  task: "selection",
  model: "gpt-6-luna",
  status: "complete",
  durationMs: 100,
  firstTokenMs: 20,
  input: 100,
  output: 50,
  cachedInput: 40,
  cacheWrite: 0,
  audioMs: null,
  ...overrides,
})
beforeEach(async () => {
  for (const table of usageDB.tables) await table.clear()
})
describe("local usage metrics", () => {
  it("does not double count cached input or reasoning tokens", () => {
    expect(estimateUsage(row(), DEFAULT_PRICES[0])).toBeCloseTo(
      (60 * 0.1 + 40 * 0.01 + 50 * 0.5) / 1e6,
    )
  })
  it("keeps unknown, interrupted, long-context and cache-write fees unknown", () => {
    for (const input of [
      row({ input: null }),
      row({ output: null }),
      row({ input: 300000 }),
      row({ cacheWrite: 10 }),
    ])
      expect(estimateUsage(input, DEFAULT_PRICES[0])).toBeNull()
    expect(estimateUsage(row())).toBeNull()
    expect(estimateUsage(row({ status: "cache" }))).toBe(0)
  })
  it("requires an explicit per-minute estimate for measured TTS duration", () => {
    expect(estimateUsage(row({ task: "tts", audioMs: 60000 }), DEFAULT_PRICES[0])).toBeNull()
    expect(
      estimateUsage(row({ task: "tts", audioMs: 30000 }), {
        ...DEFAULT_PRICES[0]!,
        audioMinute: 0.02,
      }),
    ).toBe(0.01)
  })
  it("does not resurrect pre-clear requests", async () => {
    const epoch = await usageEpoch()
    await clearUsage()
    await saveUsage(row(), epoch)
    expect(await usageDB.entries.count()).toBe(0)
  })
  it("retains no unknown or sensitive properties in a usage record", async () => {
    await expect(saveUsage({ ...row(), prompt: "secret" } as UsageEntry)).rejects.toThrow(
      "Unrecognized key",
    )
  })
  it("records one SDK generation from actual usage without retaining its text", async () => {
    const model = instrumentModel(
      new MockLanguageModelV4({
        modelId: "gpt-6-luna",
        doGenerate: {
          content: [{ type: "text", text: "private answer sentinel" }],
          finishReason: { unified: "stop", raw: "stop" },
          usage,
          warnings: [],
        },
      }),
      "page",
    )
    const result = await generateText({ model, prompt: "private prompt sentinel", maxRetries: 0 })
    expect(result.text).toBe("private answer sentinel")
    const entries = await usageDB.entries.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      task: "page",
      input: 100,
      output: 50,
      cachedInput: 40,
      status: "complete",
    })
    expect(JSON.stringify(entries)).not.toContain("sentinel")
  })
  it("passes streaming deltas through and records final usage once", async () => {
    const model = instrumentModel(
      new MockLanguageModelV4({
        modelId: "gpt-6-luna",
        doStream: {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "text-start", id: "a" })
              controller.enqueue({ type: "text-delta", id: "a", delta: "Hello" })
              controller.enqueue({ type: "text-end", id: "a" })
              controller.enqueue({
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage,
              })
              controller.close()
            },
          }),
        },
      }),
      "image",
    )
    const result = streamText({ model, prompt: "read crop", maxRetries: 0 })
    let output = ""
    for await (const delta of result.textStream) output += delta
    expect(output).toBe("Hello")
    const entries = await usageDB.entries.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.firstTokenMs).not.toBeNull()
    expect(entries[0]!.output).toBe(50)
  })
  it("records a failed request without serializing the SDK error", async () => {
    const model = instrumentModel(
      new MockLanguageModelV4({
        modelId: "gpt-6-luna",
        doGenerate: async () => {
          throw new Error("Bearer private key sentinel")
        },
      }),
      "vocabulary",
    )
    await expect(generateText({ model, prompt: "x", maxRetries: 0 })).rejects.toThrow(
      "Bearer private key sentinel",
    )
    const entries = await usageDB.entries.toArray()
    expect(entries[0]).toMatchObject({ status: "error", input: null, output: null })
    expect(JSON.stringify(entries)).not.toContain("sentinel")
  })
  it("uses a stable ID and counts a completed span at most once", async () => {
    const span = await beginUsage("tts", "test-voice")
    await span.finish("complete", { audioMs: 1200 })
    await span.finish("error")
    expect(await usageDB.entries.count()).toBe(1)
  })
})
