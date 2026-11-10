import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { openTranscriptionPage, setupTabAudioHandlers } from "../tab-audio"
import { receiveTabAudioViewNotice } from "../tab-audio-view"
const { credential, status, prepare, send, finish, handlers } = vi.hoisted(() => ({
  credential: vi.fn<(...args: any[]) => any>(),
  status: vi.fn<(...args: any[]) => any>(),
  prepare: vi.fn<(...args: any[]) => any>(),
  send: vi.fn<(...args: any[]) => any>(),
  finish: vi.fn<(...args: any[]) => any>(),
  handlers: new Map<string, (...args: any[]) => any>(),
}))
vi.mock("../config", () => ({ ensureInitializedConfig: async () => ({}) }))
vi.mock("../openai-credentials", () => ({
  readOpenAIExecutionCredential: credential,
  readOpenAIKeyStatus: status,
}))
vi.mock("../tts-playback", () => ({ prepareAudioOffscreen: prepare }))
vi.mock("../usage", () => ({ beginUsage: async () => ({ finish }) }))
vi.mock("@/utils/message", () => ({
  onMessage: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler),
  sendMessage: send,
}))
const owner = () => ({
  id: browser.runtime.id,
  url: browser.runtime.getURL("/audio-transcription.html"),
  frameId: 0,
  tab: { id: 7 },
})
const offscreen = () => ({
  id: browser.runtime.id,
  url: browser.runtime.getURL("/offscreen.html"),
  frameId: 0,
})
let session: string | undefined
beforeEach(() => {
  vi.clearAllMocks()
  handlers.clear()
  session = undefined
  credential.mockResolvedValue({ apiKey: "permanent-tab-sentinel", revision: 4 })
  status.mockResolvedValue({ configured: true, revision: 4 })
  send.mockImplementation(async (name) => (name === "renderTabAudioSourcePane" ? true : undefined))
  prepare.mockResolvedValue(undefined)
  vi.spyOn(browser.tabs, "query").mockResolvedValue([
    { id: 9, url: "https://source.test/private-meeting", windowId: 11 },
  ] as any)
  vi.spyOn(browser.tabs, "create").mockResolvedValue({ id: 7 } as any)
  vi.spyOn(browser.scripting, "executeScript").mockImplementation(async () => [])
  vi.spyOn(browser.webNavigation, "getFrame").mockImplementation(async () => ({
    url: "https://source.test/private-meeting",
    parentFrameId: -1,
    errorOccurred: false,
  }))
  vi.stubGlobal("chrome", {
    tabCapture: {
      getMediaStreamId: vi.fn<(...args: any[]) => any>().mockResolvedValue("one-use-stream"),
    },
  })
  vi.stubGlobal(
    "fetch",
    vi
      .fn<(...args: any[]) => any>()
      .mockImplementation(
        async (url) =>
          new Response(
            url.endsWith("client_secrets")
              ? JSON.stringify({ value: "ek-one-use" })
              : "v=0\r\nanswer",
          ),
      ),
  )
  setupTabAudioHandlers()
})
afterEach(async () => {
  if (session)
    await handlers.get("tabAudioControl")!({
      sender: owner(),
      data: { command: "cancel", session },
    })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function start(mode: "live" | "record") {
  await openTranscriptionPage({
    id: browser.runtime.id,
    url: browser.runtime.getURL("/popup.html"),
  })
  const created = vi.mocked(browser.tabs.create).mock.calls.at(-1)![0]
  const channel = new URL(created.url!).searchParams.get("source")!
  const result = await handlers.get("tabAudioControl")!({
    sender: owner(),
    data: {
      command: "start",
      channel,
      mode,
      languages: ["en", "ja", "vi"],
      prompt: "Technical meeting",
    },
  })
  session = result.session
  return channel
}
it("starts record-only capture without credentials or a provider request and consumes the source channel", async () => {
  const channel = await start("record")
  expect(credential).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
  expect(status).not.toHaveBeenCalled()
  expect(send).toHaveBeenCalledWith(
    "tabAudioStartOffscreen",
    expect.objectContaining({ session, mode: "record", streamId: "one-use-stream" }),
  )
  await handlers.get("tabAudioControl")!({ sender: owner(), data: { command: "stop", session } })
  await expect(
    handlers.get("tabAudioControl")!({
      sender: owner(),
      data: { command: "start", channel, mode: "record", languages: [], prompt: "" },
    }),
  ).rejects.toThrow(/hết hạn/)
})
it("keeps permanent and ephemeral credentials in the private runtime for a multilingual transcription-only session", async () => {
  await start("live")
  const answer = await handlers.get("tabAudioOffer")!({
    sender: offscreen(),
    data: { session, sdp: "v=0\r\noffer" },
  })
  expect(answer).toBe("v=0\r\nanswer")
  const calls = vi.mocked(fetch).mock.calls
  expect(calls).toHaveLength(2)
  expect(calls[0]![0]).toBe("https://api.openai.com/v1/realtime/client_secrets")
  const config = JSON.parse(calls[0]![1]!.body as string)
  expect(config.session).toEqual({
    type: "transcription",
    audio: {
      input: {
        transcription: {
          model: "gpt-live-transcribe",
          languages: ["en", "ja", "vi"],
          prompt: "Technical meeting",
        },
        turn_detection: null,
      },
    },
  })
  expect(calls[0]![1]!.headers).toEqual({
    Authorization: "Bearer permanent-tab-sentinel",
    "Content-Type": "application/json",
  })
  expect(calls[1]![0]).toBe("https://api.openai.com/v1/realtime/calls")
  expect(calls[1]![1]!.headers).toEqual({
    Authorization: "Bearer ek-one-use",
    "Content-Type": "application/sdp",
  })
  expect(JSON.stringify(send.mock.calls)).not.toContain("sentinel")
  expect(JSON.stringify(send.mock.calls)).not.toContain("ek-one-use")
  await expect(
    handlers.get("tabAudioOffer")!({
      sender: offscreen(),
      data: { session, sdp: "v=0\r\nduplicate" },
    }),
  ).rejects.toThrow(/Invalid/)
  expect(fetch).toHaveBeenCalledTimes(2)
})
it("rejects forged page/offscreen senders before capture or credential access", async () => {
  for (const sender of [
    { ...owner(), frameId: 2 },
    { ...owner(), url: "https://fake.test/audio-transcription.html" },
  ])
    await expect(
      handlers.get("tabAudioControl")!({
        sender,
        data: {
          command: "start",
          channel: crypto.randomUUID(),
          mode: "live",
          languages: [],
          prompt: "",
        },
      }),
    ).rejects.toThrow(/Invalid/)
  await start("live")
  await expect(
    handlers.get("tabAudioOffer")!({ sender: owner(), data: { session, sdp: "v=0\r\nforged" } }),
  ).rejects.toThrow(/Invalid/)
  expect(credential).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})
it("detects credential revocation during a session and stops without a paid retry", async () => {
  await start("live")
  status.mockResolvedValue({ configured: false, revision: 5 })
  expect(await handlers.get("tabAudioAlive")!({ sender: offscreen(), data: { session } })).toBe(
    false,
  )
  expect(send).toHaveBeenCalledWith("tabAudioStopOffscreen", { session, discard: true })
  expect(fetch).not.toHaveBeenCalled()
})
it("uses shorter local turns and returns to the source only for an explicitly started YouTube live session", async () => {
  vi.mocked(browser.webNavigation.getFrame).mockImplementation(async () => ({
    url: "https://www.youtube.com/watch?v=fixture",
    parentFrameId: -1,
    errorOccurred: false,
  }))
  vi.mocked(browser.tabs.query).mockResolvedValue([
    { id: 9, url: "https://www.youtube.com/watch?v=fixture", windowId: 11 },
  ] as any)
  const activate = vi.spyOn(browser.tabs, "update").mockResolvedValue({} as any)
  await start("live")
  expect(send).toHaveBeenCalledWith(
    "tabAudioStartOffscreen",
    expect.objectContaining({ shortTurns: true, mode: "live" }),
  )
  expect(activate).toHaveBeenCalledWith(9, { active: true })
  expect(fetch).not.toHaveBeenCalled()
})
it("opens the same source view and short turns for an ordinary website with a ready content runtime", async () => {
  const activate = vi.spyOn(browser.tabs, "update").mockResolvedValue({} as any)
  await start("live")
  expect(send).toHaveBeenCalledWith("renderTabAudioSourcePane", undefined, { tabId: 9, frameId: 0 })
  expect(send).toHaveBeenCalledWith(
    "tabAudioStartOffscreen",
    expect.objectContaining({ shortTurns: true }),
  )
  expect(activate).toHaveBeenCalledWith(9, { active: true })
  expect(
    (
      await handlers.get("getTabAudioView")!({
        sender: {
          id: browser.runtime.id,
          frameId: 0,
          tab: { id: 9 },
          url: "https://source.test/private-meeting",
        },
      })
    ).view.session,
  ).toBe(session)
})
it("keeps the owned bounded transcript for explicit view recovery when a document cannot mount the view", async () => {
  send.mockImplementation(async (name) => {
    if (name === "renderTabAudioSourcePane") throw new Error("Receiving end does not exist")
  })
  const activate = vi.spyOn(browser.tabs, "update").mockResolvedValue({} as any)
  await start("live")
  expect(send).toHaveBeenCalledWith(
    "tabAudioStartOffscreen",
    expect.objectContaining({ shortTurns: false }),
  )
  expect(activate).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
  expect(
    (
      await handlers.get("getTabAudioView")!({
        sender: {
          id: browser.runtime.id,
          frameId: 0,
          tab: { id: 9 },
          url: "https://source.test/private-meeting",
        },
      })
    ).view.session,
  ).toBe(session)
})
it("falls back to the Audio page after a bounded wait for a stalled source-view import", async () => {
  vi.useFakeTimers()
  try {
    send.mockImplementation(async (name) => {
      if (name === "renderTabAudioSourcePane") return new Promise(() => {})
      return undefined
    })
    const pending = start("live")
    await vi.advanceTimersByTimeAsync(3001)
    await pending
    expect(send).toHaveBeenCalledWith(
      "tabAudioStartOffscreen",
      expect.objectContaining({ shortTurns: false }),
    )
  } finally {
    vi.useRealTimers()
  }
})

it("only the owning Audio page can reopen the same live transcript without another capture or paid request", async () => {
  send.mockImplementation(async (name) => (name === "renderTabAudioSourcePane" ? false : undefined))
  await start("live")
  receiveTabAudioViewNotice(
    {
      target: "read-frog-tab-audio-notice",
      session,
      type: "text",
      text: "Already heard.",
      pending: "Still speaking",
    },
    offscreen(),
  )
  const injections = vi.mocked(browser.scripting.executeScript).mock.calls.length
  for (const sender of [
    { ...owner(), tab: { id: 8 } },
    { ...owner(), frameId: 1 },
    { ...owner(), url: "https://evil.test/" },
  ])
    await expect(handlers.get("showTabAudioView")!({ sender, data: { session } })).rejects.toThrow(
      /Invalid/,
    )
  expect(browser.scripting.executeScript).toHaveBeenCalledTimes(injections)
  send.mockImplementation(async (name) => (name === "renderTabAudioSourcePane" ? true : undefined))
  expect(await handlers.get("showTabAudioView")!({ sender: owner(), data: { session } })).toEqual({
    ok: true,
  })
  expect(send.mock.calls.filter(([name]) => name === "tabAudioStartOffscreen")).toHaveLength(1)
  expect(send).toHaveBeenCalledWith("tabAudioUseSourceView", { session })
  expect(fetch).not.toHaveBeenCalled()
  expect(credential).not.toHaveBeenCalled()
  const snapshot = await handlers.get("getTabAudioView")!({
    sender: {
      id: browser.runtime.id,
      frameId: 0,
      tab: { id: 9 },
      url: "https://source.test/private-meeting",
    },
  })
  expect(snapshot.view.text).toBe("Already heard.")
  expect(snapshot.view.pending).toBe("Still speaking")
})
