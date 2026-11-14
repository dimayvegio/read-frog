// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PdfViewport } from "../viewport"

beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

function createMockViewport() {
  const host = document.createElement("div")
  const changed = vi.fn<(...args: any[]) => any>()
  const error = vi.fn<(...args: any[]) => any>()
  const mockPdf = {
    numPages: 10,
    getPage: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      getViewport: () => ({ width: 600, height: 800 }),
      cleanup: vi.fn<(...args: any[]) => any>(),
    }),
  }
  const vp = new PdfViewport(host, mockPdf as any, changed, error, "f".repeat(64))
  return { vp, host, changed, error }
}

describe("Navigation History (Back / Forward)", () => {
  it("initializes with empty history stacks", () => {
    const { vp } = createMockViewport()
    expect(vp.canGoBack()).toBe(false)
    expect(vp.canGoForward()).toBe(false)
  })

  it("pushes history when navigating to another page", async () => {
    const { vp } = createMockViewport()
    await vp.init({ page: 1, offset: 0, zoom: "fit-width" })

    expect(vp.canGoBack()).toBe(false)

    // Navigate to page 5
    vp.navigate(5, 0)
    expect(vp.canGoBack()).toBe(true)
    expect(vp.canGoForward()).toBe(false)

    // Navigate to page 8
    vp.navigate(8, 0)
    expect(vp.canGoBack()).toBe(true)

    // Go back to page 5
    const backed = vp.goBack()
    expect(backed).toBe(true)
    expect(vp.canGoForward()).toBe(true)

    // Go back to page 1
    vp.goBack()
    expect(vp.canGoBack()).toBe(false)
    expect(vp.canGoForward()).toBe(true)

    // Go forward to page 5
    const forwarded = vp.goForward()
    expect(forwarded).toBe(true)
    expect(vp.canGoBack()).toBe(true)
  })

  it("notifies history change listeners", async () => {
    const { vp } = createMockViewport()
    await vp.init({ page: 1, offset: 0, zoom: "fit-width" })

    const listener = vi.fn<(...args: any[]) => any>()
    const unsub = vp.onHistoryChange(listener)

    vp.navigate(3, 0)
    expect(listener).toHaveBeenCalled()

    unsub()
    vp.navigate(4, 0)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
