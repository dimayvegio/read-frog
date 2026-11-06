import { beforeEach, describe, expect, it, vi } from "vitest"
import { browser, storage } from "#imports"
import { MAX_NATIVE_SELECTION_LENGTH, NATIVE_SELECTION_TTL_MS } from "@/types/native-selection"
import { MENU_ID_SELECTION_TRANSLATE, registerContextMenuListeners } from "../context-menu"
import { openNativeSelectionResult, setupNativeSelectionHandlers } from "../native-selection"

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (message: any) => Promise<unknown>>(),
}))
const removedTabs: Array<(id: number, info: any) => void> = []
const removedWindows: Array<(id: number) => void> = []
vi.mock("@/utils/message", () => ({
  onMessage: vi.fn<(name: string, handler: (message: any) => Promise<unknown>) => void>(
    (name, handler) => {
      handlers.set(name, handler)
    },
  ),
  sendMessage: vi.fn<(...args: any[]) => any>().mockRejectedValue(new Error("No content receiver")),
}))
vi.mock("../config", () => ({ ensureInitializedConfig: vi.fn<(...args: any[]) => any>() }))

describe("native PDF selection result lifecycle", () => {
  beforeEach(async () => {
    await browser.storage.session.clear()
    vi.restoreAllMocks()
    removedTabs.length = 0
    removedWindows.length = 0
    vi.spyOn(browser.tabs.onRemoved, "addListener").mockImplementation((listener) => {
      removedTabs.push(listener)
    })
    vi.spyOn(browser.windows.onRemoved, "addListener").mockImplementation((listener) => {
      removedWindows.push(listener)
    })
    vi.spyOn(browser.windows, "create").mockResolvedValue({ id: 50 } as any)
    vi.spyOn(browser.windows, "get").mockRejectedValue(new Error("Closed"))
    vi.spyOn(browser.windows, "update").mockResolvedValue({ id: 50 } as any)
    vi.spyOn(browser.windows, "remove").mockResolvedValue(undefined)
    handlers.clear()
    setupNativeSelectionHandlers()
  })

  const resultURL = (index = 0) =>
    String(vi.mocked(browser.windows.create).mock.calls[index]?.[0]?.url)
  const channel = (index = 0) => new URL(resultURL(index)).searchParams.get("selectionId")!
  const key = (index = 0) => `native-selection:${channel(index)}`
  const get = (selectionId = channel(), url = browser.runtime.getURL("/selection-result.html")) =>
    handlers.get("getNativeSelection")!({
      data: { selectionId },
      sender: { id: browser.runtime.id, url, frameId: 0 },
    })

  it("stores only the selected text in session storage and passes no text or local path in the URL", async () => {
    await openNativeSelectionResult("Selected paragraph", 12)
    const url = vi.mocked(browser.windows.create).mock.calls[0]?.[0]?.url
    expect(url).toBe(`${browser.runtime.getURL("/selection-result.html")}?selectionId=${channel()}`)
    expect(await get()).toEqual({
      id: expect.any(String),
      text: "Selected paragraph",
      tooLong: false,
      createdAt: expect.any(Number),
    })
    expect(await browser.storage.local.get(null)).not.toHaveProperty(key())
  })

  it("reuses the result window while replacing its request id and selected text", async () => {
    await openNativeSelectionResult("First selection", 12)
    const first = (await get()) as { id: string }
    vi.mocked(browser.windows.get).mockResolvedValue({
      id: 50,
      tabs: [{ id: 51, url: resultURL() }],
    } as any)
    await openNativeSelectionResult("Second selection", 12)
    expect(browser.windows.create).toHaveBeenCalledTimes(1)
    expect(await get()).toMatchObject({ text: "Second selection" })
    expect(((await get()) as { id: string }).id).not.toBe(first.id)
    expect(browser.windows.update).toHaveBeenCalledWith(50, { focused: true })
  })

  it("isolates simultaneous selections from different source tabs", async () => {
    await Promise.all([
      openNativeSelectionResult("Document A", 10),
      openNativeSelectionResult("Document B", 11),
    ])
    expect(await get(channel(0))).toMatchObject({ text: "Document A" })
    expect(await get(channel(1))).toMatchObject({ text: "Document B" })
  })

  it("does not retain or silently truncate oversized selections", async () => {
    await openNativeSelectionResult("a".repeat(MAX_NATIVE_SELECTION_LENGTH + 1), 12)
    expect(await get()).toMatchObject({ text: "", tooLong: true })
  })

  it("rejects reads from content scripts and unrelated extension pages", async () => {
    await openNativeSelectionResult("Private selection", 12)
    for (const url of [
      "https://example.com/selection-result.html",
      browser.runtime.getURL("/options.html"),
    ]) {
      await expect(get(channel(), url)).rejects.toThrow("selection result window")
    }
  })

  it("expires the selected text and removes it from temporary storage", async () => {
    await openNativeSelectionResult("Expired selection", 12)
    const now = Date.now()
    vi.spyOn(Date, "now").mockReturnValue(now + NATIVE_SELECTION_TTL_MS + 1)
    expect(await get()).toBeNull()
    expect(await browser.storage.session.get(key())).toEqual({})
  })

  it("closes only the associated result window when the source tab closes", async () => {
    await openNativeSelectionResult("Source PDF selection", 12)
    removedTabs[0]!(12, { windowId: 1, isWindowClosing: false })
    await vi.waitFor(() => expect(browser.windows.remove).toHaveBeenCalledExactlyOnceWith(50))
    expect(await browser.storage.session.get(key())).toEqual({})
  })

  it("clears temporary selected text when the result window closes", async () => {
    await openNativeSelectionResult("Source PDF selection", 12)
    removedWindows[0]!(50)
    await vi.waitFor(async () => expect(await browser.storage.session.get(key())).toEqual({}))
    expect(browser.windows.remove).not.toHaveBeenCalled()
  })

  it.each([{ id: -1, windowId: 3 }, undefined])(
    "loads a native PDF menu selection end to end when the browser supplies %j",
    async (guestTab) => {
      let clicked: (info: any, tab: any) => Promise<void>
      vi.spyOn(storage, "watch").mockReturnValue(() => {})
      vi.spyOn(browser.contextMenus.onClicked, "addListener").mockImplementation((listener) => {
        clicked = listener as typeof clicked
      })
      vi.spyOn(browser.tabs, "query").mockResolvedValue([{ id: 12 }] as any)
      registerContextMenuListeners()
      await clicked!(
        { menuItemId: MENU_ID_SELECTION_TRANSLATE, selectionText: "PDF selection", frameId: 7 },
        guestTab,
      )
      expect(await get()).toMatchObject({ text: "PDF selection" })
      expect(resultURL()).not.toContain("sourceTabId")
      expect(await browser.storage.session.get(key())).toMatchObject({
        [key()]: { sourceTabId: 12 },
      })
    },
  )

  it("keeps guest selections independent when no real source tab can be resolved", async () => {
    await openNativeSelectionResult("Guest A", -1)
    await openNativeSelectionResult("Guest B")
    expect(channel(0)).not.toBe(channel(1))
    expect(await get(channel(0))).toMatchObject({ text: "Guest A" })
    expect(await get(channel(1))).toMatchObject({ text: "Guest B" })
  })

  it("does not leave selected text behind when creating the result window fails", async () => {
    vi.mocked(browser.windows.create).mockRejectedValueOnce(new Error("Cannot open window"))
    await expect(openNativeSelectionResult("PDF selection", 12)).rejects.toThrow("Cannot open")
    expect(await browser.storage.session.get(null)).toEqual({})
  })

  it("does not resurrect selected text when the source closes during window creation", async () => {
    vi.mocked(browser.windows.create).mockImplementationOnce(async () => {
      removedTabs[0]!(12, { windowId: 1, isWindowClosing: false })
      await vi.waitFor(async () => expect(await browser.storage.session.get(key())).toEqual({}))
      return { id: 50 } as any
    })
    await openNativeSelectionResult("PDF selection", 12)
    expect(await browser.storage.session.get(null)).toEqual({})
    expect(browser.windows.remove).toHaveBeenCalledExactlyOnceWith(50)
  })
})
