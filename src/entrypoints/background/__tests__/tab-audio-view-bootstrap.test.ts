import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { SourceViewBootstrap } from "../tab-audio-view-bootstrap"
const { send } = vi.hoisted(() => ({ send: vi.fn<(...args: any[]) => Promise<any>>() }))
vi.mock("@/utils/message", () => ({ sendMessage: send }))
const url = "https://www.facebook.com/JamieZhu"
beforeEach(() => {
  send.mockReset().mockResolvedValue(true)
  vi.spyOn(browser.webNavigation, "getFrame").mockImplementation(async () => ({
    url,
    documentId: "current-doc",
    parentFrameId: -1,
    errorOccurred: false,
  }))
  vi.spyOn(browser.scripting, "executeScript").mockImplementation(async () => [])
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
it("injects only the fixed isolated bundle into the exact owned document and requires a rendered-view acknowledgement", async () => {
  const boot = new SourceViewBootstrap(9, url, () => true)
  expect(await boot.open()).toEqual({ ok: true })
  expect(browser.scripting.executeScript).toHaveBeenCalledExactlyOnceWith({
    target: { tabId: 9, documentIds: ["current-doc"] },
    world: "ISOLATED",
    files: ["/live-transcript-view.js"],
  })
  send.mockResolvedValue(false)
  expect(await boot.open()).toEqual({ ok: false, reason: "UI-LOAD-FAILED" })
})
it("does not inject into a changed route or after session cancellation", async () => {
  vi.mocked(browser.webNavigation.getFrame).mockImplementation(async () => ({
    url: url + "?changed=1",
    parentFrameId: -1,
    errorOccurred: false,
  }))
  expect(await new SourceViewBootstrap(9, url, () => true).open()).toEqual({
    ok: false,
    reason: "UI-SOURCE-CHANGED",
  })
  expect(await new SourceViewBootstrap(9, url, () => false).open()).toEqual({
    ok: false,
    reason: "UI-SOURCE-CHANGED",
  })
  expect(browser.scripting.executeScript).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
})
it("bounds stalled attempts to three seconds and shares a pending injection across explicit recovery attempts", async () => {
  vi.useFakeTimers()
  let finish!: (value: any) => void
  vi.mocked(browser.scripting.executeScript).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  let alive = true
  const boot = new SourceViewBootstrap(9, url, () => alive)
  const first = boot.open()
  await vi.advanceTimersByTimeAsync(3001)
  expect(await first).toEqual({ ok: false, reason: "UI-LOAD-TIMEOUT" })
  const second = boot.open()
  await vi.advanceTimersByTimeAsync(3001)
  expect(await second).toEqual({ ok: false, reason: "UI-LOAD-TIMEOUT" })
  expect(browser.scripting.executeScript).toHaveBeenCalledTimes(1)
  alive = false
  finish([])
  await vi.advanceTimersByTimeAsync(0)
  expect(send).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
