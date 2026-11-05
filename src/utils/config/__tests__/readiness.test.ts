// @vitest-environment jsdom
import { createStore } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"

vi.unmock("@/utils/config/readiness")
const mocks = vi.hoisted(() => ({
  send: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  get: vi.fn<() => Promise<unknown>>(),
  set: vi.fn<(...args: unknown[]) => Promise<void>>(),
}))
vi.mock("@/utils/message", () => ({ sendMessage: mocks.send }))
vi.mock("@/utils/atoms/storage-adapter", () => ({
  storageAdapter: {
    get: mocks.get,
    set: mocks.set,
    setMeta: vi.fn<() => Promise<void>>(),
    watch: () => () => {},
  },
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.get.mockResolvedValue(structuredClone(DEFAULT_CONFIG))
  mocks.set.mockResolvedValue()
})

describe("context readiness barrier", () => {
  it("coalesces reads and retries a failure only on explicit request", async () => {
    mocks.send.mockResolvedValueOnce({ ok: false, code: "STORAGE_UNAVAILABLE", retryable: true })
    const { awaitConfigReady } = await import("../readiness")
    const first = awaitConfigReady()
    expect(awaitConfigReady()).toBe(first)
    await expect(first).rejects.toThrow("STORAGE_UNAVAILABLE")
    await expect(awaitConfigReady()).rejects.toThrow("STORAGE_UNAVAILABLE")
    expect(mocks.send).toHaveBeenCalledOnce()
    mocks.send.mockResolvedValueOnce({ ok: true, config: DEFAULT_CONFIG, schemaVersion: 121 })
    await expect(awaitConfigReady(true)).resolves.toEqual(DEFAULT_CONFIG)
    expect(mocks.send).toHaveBeenCalledTimes(2)
  })
  it("does not read, optimistically mutate, or persist config before READY", async () => {
    let ready!: (value: unknown) => void
    mocks.send.mockReturnValueOnce(
      new Promise((resolve) => {
        ready = resolve
      }),
    )
    const { configAtom, writeConfigAtom } = await import("@/utils/atoms/config")
    const store = createStore()
    const writing = store.set(writeConfigAtom, { uiLanguage: "vi" })
    expect(store.get(configAtom)).toEqual(DEFAULT_CONFIG)
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.set).not.toHaveBeenCalled()
    ready({ ok: true, config: DEFAULT_CONFIG, schemaVersion: 121 })
    await writing
    expect(store.get(configAtom).uiLanguage).toBe("vi")
    expect(mocks.set).toHaveBeenCalledOnce()
  })
})
