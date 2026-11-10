// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { keepLiveTranscriptVisible } from "../keep-visible"

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

it("repairs a removed host without observing busy app subtrees, and cancels queued repair on close", async () => {
  vi.useFakeTimers()
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 16),
  )
  vi.stubGlobal("cancelAnimationFrame", clearTimeout)
  const app = document.createElement("main"),
    host = document.createElement("aside")
  document.body.append(app, host)
  const place = vi.fn<() => void>(() => {
    if (!host.isConnected) document.body.append(host)
  })
  const dispose = keepLiveTranscriptVisible(host, place)
  for (let i = 0; i < 100; i++) app.append(document.createElement("div"))
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(20)
  expect(place).toHaveBeenCalledTimes(1)

  host.remove()
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(20)
  expect(host.isConnected).toBe(true)
  expect(place).toHaveBeenCalledTimes(2)

  host.remove()
  await Promise.resolve()
  dispose()
  await vi.advanceTimersByTimeAsync(2500)
  expect(host.isConnected).toBe(false)
  expect(place).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})
