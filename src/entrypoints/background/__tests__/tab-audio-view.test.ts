import { beforeEach, expect, it, vi } from "vitest"
import { browser } from "#imports"
import {
  beginTabAudioView,
  clearTabAudioView,
  finishTabAudioView,
  receiveTabAudioViewNotice,
  setupTabAudioViewHandlers,
} from "../tab-audio-view"
const { handlers, send, stop, translate } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  send: vi.fn<(...args: any[]) => any>(),
  stop: vi.fn<(...args: any[]) => any>(),
  translate: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("../tab-audio-translation", () => ({ createLiveTranslator: () => translate }))
vi.mock("@/utils/message", () => ({
  onMessage: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler),
  sendMessage: send,
}))
const id = crypto.randomUUID()
const source = () => ({
  id: browser.runtime.id,
  frameId: 0,
  url: "https://www.youtube.com/watch?v=fixture",
  tab: { id: 9 },
})
const offscreen = () => ({
  id: browser.runtime.id,
  frameId: 0,
  url: browser.runtime.getURL("/offscreen.html"),
})
const audio = () => ({
  id: browser.runtime.id,
  frameId: 0,
  url: browser.runtime.getURL("/audio-transcription.html"),
  tab: { id: 7 },
})
const call = (name: string, data: unknown, sender: unknown = source()) =>
  handlers.get(name)!({ sender, data })
const notice = (type: string, data = {}) => ({
  target: "read-frog-tab-audio-notice",
  session: id,
  type,
  ...data,
})
beforeEach(() => {
  clearTabAudioView()
  vi.clearAllMocks()
  handlers.clear()
  send.mockResolvedValue(undefined)
  stop.mockResolvedValue(true)
  translate.mockImplementation(async (rows) => rows.map(() => "Bản dịch."))
  setupTabAudioViewHandlers(stop)
  beginTabAudioView(id, 9, 7, source().url)
})
it("only the selected source top frame receives snapshots or controls, never another tab/iframe/origin", async () => {
  expect(call("getTabAudioView", undefined).view.session).toBe(id)
  for (const sender of [
    audio(),
    { ...source(), frameId: 1 },
    { ...source(), id: "forged" },
    { ...source(), tab: { id: 10 } },
    { ...source(), url: "https://youtube.com.evil.test/watch" },
  ]) {
    expect(call("getTabAudioView", undefined, sender).view).toBeNull()
    await expect(
      call("tabAudioViewAction", { session: id, action: "stop" }, sender),
    ).rejects.toThrow(/Invalid|abort/i)
    expect(() =>
      call("setTabAudioTranslation", { session: id, target: "vie", enabled: true }, sender),
    ).toThrow(/Invalid/)
  }
  expect(stop).not.toHaveBeenCalled()
  expect(translate).not.toHaveBeenCalled()
  expect(send).toHaveBeenCalledWith("tabAudioViewChanged", expect.anything(), {
    tabId: 9,
    frameId: 0,
  })
})
it("relays only trusted bounded transcript notices, rejecting recording blob URLs, stale sessions and oversized data", () => {
  receiveTabAudioViewNotice(notice("started"), offscreen())
  receiveTabAudioViewNotice(
    notice("text", { text: "a".repeat(50000), pending: "p".repeat(9000) }),
    offscreen(),
  )
  const view = call("getTabAudioView", undefined).view
  expect(view.text).toHaveLength(16000)
  expect(view.pending).toHaveLength(4000)
  const revision = call("getTabAudioView", undefined).revision
  for (const raw of [
    notice("recording", { url: "blob:secret" }),
    notice("text", { text: "x".repeat(500001), pending: "" }),
    { ...notice("stopped"), session: crypto.randomUUID() },
  ])
    receiveTabAudioViewNotice(raw, offscreen())
  receiveTabAudioViewNotice(notice("stopped", { message: "forged" }), source() as any)
  expect(call("getTabAudioView", undefined).revision).toBe(revision)
  expect(JSON.stringify(send.mock.calls)).not.toContain("blob:")
})
it("translates finalized original text only after explicit source opt-in and retains a stopped view until owner/source closes", async () => {
  receiveTabAudioViewNotice(
    notice("text", { text: "Hello.", pending: "Still speaking" }),
    offscreen(),
  )
  expect(translate).not.toHaveBeenCalled()
  call("setTabAudioTranslation", { session: id, target: "vie", enabled: true })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(translate.mock.calls[0]![0]).toEqual([{ id: 0, source: "Hello.", context: "" }])
  finishTabAudioView(id)
  expect(call("getTabAudioView", undefined).view.status).toBe("stopped")
  clearTabAudioView(88)
  expect(call("getTabAudioView", undefined).view).not.toBeNull()
  clearTabAudioView(7)
  expect(call("getTabAudioView", undefined).view).toBeNull()
})
it("source may stop or focus Audio; only its Audio owner may focus the video", async () => {
  vi.spyOn(browser.tabs, "get").mockImplementation(
    async (tab) => ({ id: tab, windowId: 11 }) as any,
  )
  const activate = vi.spyOn(browser.tabs, "update").mockResolvedValue({} as any)
  vi.spyOn(browser.windows, "update").mockResolvedValue({} as any)
  expect(await call("tabAudioViewAction", { session: id, action: "stop" })).toBe(true)
  expect(stop).toHaveBeenCalledWith(id, 9)
  expect(await call("tabAudioViewAction", { session: id, action: "audio" })).toBe(true)
  expect(activate).toHaveBeenLastCalledWith(7, { active: true })
  await expect(call("tabAudioViewAction", { session: id, action: "video" })).rejects.toThrow(
    /Invalid|abort/i,
  )
  expect(await call("tabAudioViewAction", { session: id, action: "video" }, audio())).toBe(true)
  expect(activate).toHaveBeenLastCalledWith(9, { active: true })
})
it("supports a selected ordinary HTTP/HTTPS/file document without authorizing a different route in the same tab", () => {
  for (const url of [
    "http://localhost:8123/video",
    "https://lectures.test/watch",
    "file:///C:/audio.html",
  ]) {
    beginTabAudioView(id, 9, 7, url)
    const sender = { ...source(), url }
    expect(call("getTabAudioView", undefined, sender).view.session).toBe(id)
    expect(call("getTabAudioView", undefined, { ...sender, url: url + "?other" }).view).toBeNull()
    expect(call("getTabAudioView", undefined, { ...sender, frameId: 2 }).view).toBeNull()
  }
  beginTabAudioView(id, 9, 7, "edge://settings/")
  expect(call("getTabAudioView", undefined).view).toBeNull()
})
