import { beforeEach, it, expect, vi } from "vitest"
import { browser } from "#imports"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { alignReadingSentences, trustedReadingLab, setupReadingLabHandlers } from "../reading-lab"
const { generate, key, handlers } = vi.hoisted(() => ({
  generate: vi.fn<(...args: any[]) => any>(),
  key: vi.fn<(...args: any[]) => any>(),
  handlers: new Map<string, (...args: any[]) => any>(),
}))
vi.mock("../background-stream", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  generateTextForProviderRef: generate,
}))
vi.mock("../config", () => ({ ensureInitializedConfig: async () => DEFAULT_CONFIG }))
vi.mock("../openai-credentials", () => ({ readOpenAIKeyStatus: key }))
vi.mock("../usage", () => ({ recordCacheHit: async () => {} }))
vi.mock("@/utils/message", () => ({
  onMessage: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler),
}))
beforeEach(() => {
  vi.clearAllMocks()
  handlers.clear()
  key.mockResolvedValue({ configured: true, revision: Math.random() })
  generate.mockResolvedValue('{"ends":[[0,0],[1,1]]}')
})
it("limits one-use capture consumption and alignment to the owned top-level page", async () => {
  setupReadingLabHandlers()
  const create = vi.spyOn(browser.tabs, "create").mockResolvedValue({} as any)
  const capture = { original: "Yes.", translation: "Đúng.", title: "Private PDF title" }
  await handlers.get("openReadingLab")!({ sender: { id: browser.runtime.id }, data: capture })
  const channel = new URL(create.mock.calls[0]![0].url!).searchParams.get("channel")!
  const sender = {
    id: browser.runtime.id,
    url: browser.runtime.getURL("/reading-lab.html"),
    frameId: 0,
  }
  expect(trustedReadingLab(sender)).toBe(true)
  for (const wrong of [
    { ...sender, frameId: 1 },
    { ...sender, url: "https://evil.test/reading-lab.html" },
    { ...sender, id: "other" },
  ]) {
    expect(trustedReadingLab(wrong)).toBe(false)
    expect(() =>
      handlers.get("consumeReadingCapture")!({ sender: wrong, data: { channel } }),
    ).toThrow(/Invalid/)
  }
  expect(handlers.get("consumeReadingCapture")!({ sender, data: { channel } })).toEqual(capture)
  expect(handlers.get("consumeReadingCapture")!({ sender, data: { channel } })).toBeNull()
  create.mockRestore()
})
it("only sends text/index pairs, validates complete AI boundaries and rejects changed credentials", async () => {
  const capture = {
    original: "Yes. I agree.",
    translation: "Đúng. Tôi đồng ý.",
    title: "C:/private-book.pdf",
  }
  key.mockResolvedValue({ configured: true, revision: 10 })
  const pairs = await alignReadingSentences(capture, new AbortController().signal)
  expect(pairs).toHaveLength(2)
  expect(generate.mock.calls[0]![0].prompt).not.toContain("private-book")
  expect(generate.mock.calls[0]![0].usageTask).toBe("segmentation")
  key
    .mockResolvedValueOnce({ configured: true, revision: 20 })
    .mockResolvedValueOnce({ configured: true, revision: 21 })
  await expect(alignReadingSentences(capture, new AbortController().signal)).rejects.toThrow(
    /đã đổi/,
  )
})
