import { afterEach, expect, it, vi } from "vitest"
import { REMOTE_SITE_RULES_ENABLED } from "@/utils/site-rules/remote/document"
import { setupEdgeTTSMessageHandlers } from "../edge-tts"

const handlers = vi.hoisted(() => new Map<string, () => Promise<unknown>>())
vi.mock("@/utils/message", () => ({
  onMessage: (name: string, handler: () => Promise<unknown>) => handlers.set(name, handler),
}))
afterEach(() => {
  handlers.clear()
  vi.unstubAllGlobals()
})
it("retains legacy speech messages without any Microsoft network fallback", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
  vi.stubGlobal("fetch", fetch)
  setupEdgeTTSMessageHandlers()
  expect(await handlers.get("edgeTtsSynthesize")!()).toMatchObject({ ok: false })
  await expect(handlers.get("edgeTtsListVoices")!()).rejects.toThrow(/disabled/)
  await expect(handlers.get("edgeTtsHealthCheck")!()).rejects.toThrow(/disabled/)
  expect(fetch).not.toHaveBeenCalled()
  expect(REMOTE_SITE_RULES_ENABLED).toBe(false)
})
