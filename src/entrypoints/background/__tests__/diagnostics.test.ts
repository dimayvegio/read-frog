import type { StoredLogRecord } from "@/utils/logging/stored-record"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { browser } from "#imports"

type Handler = (message: { data: unknown; sender: unknown }) => unknown

const { onMessageMock, storeLogRecordsMock } = vi.hoisted(() => ({
  onMessageMock: vi.fn<(type: string, handler: Handler) => void>(),
  storeLogRecordsMock: vi.fn<(records: StoredLogRecord[]) => void>(),
}))

vi.mock("@/utils/message", () => ({ onMessage: onMessageMock }))
vi.mock("@/utils/logging/sinks/persist", () => ({ storeLogRecords: storeLogRecordsMock }))
vi.mock("@/utils/diagnostics/report", () => ({
  buildDiagnosticsReport: vi.fn<() => Promise<unknown>>(),
}))

const record = {
  time: 1,
  level: "warn",
  scope: "host/translate",
  message: "Slow",
  fields: { n: 1 },
}

async function getHandler() {
  const { setupDiagnosticsHandlers } = await import("../diagnostics")
  setupDiagnosticsHandlers()
  const [, handler] = onMessageMock.mock.calls.find(([type]) => type === "storeLogRecords")!
  return handler
}

describe("storeLogRecords handler", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it("stores a content script's records with its tab and site, not its URL", async () => {
    const handler = await getHandler()

    handler({
      data: { context: "content", records: [record] },
      sender: {
        id: browser.runtime.id,
        tab: { id: 7 },
        url: "https://kagi.com/changelog?session=1",
      },
    })

    expect(storeLogRecordsMock).toHaveBeenCalledExactlyOnceWith([
      { ...record, context: "content", tabId: 7, host: "kagi.com" },
    ])
  })

  it("stores an extension page's records under the page's name", async () => {
    const handler = await getHandler()

    handler({
      data: { context: "options", records: [record] },
      sender: {
        id: browser.runtime.id,
        frameId: 0,
        tab: { id: 3 },
        url: browser.runtime.getURL("/options.html"),
      },
    })

    expect(storeLogRecordsMock).toHaveBeenCalledExactlyOnceWith([{ ...record, context: "options" }])
  })

  it.each([
    ["an unknown context", { context: "background", records: [record] }],
    [
      "a record of the wrong shape",
      { context: "content", records: [{ ...record, level: "fatal" }] },
    ],
    ["a bare array", [record]],
  ])("ignores %s", async (_, data) => {
    const handler = await getHandler()

    handler({ data, sender: {} })

    expect(storeLogRecordsMock).not.toHaveBeenCalled()
  })
  it("rejects foreign senders, spoofed page contexts and subframes", async () => {
    const handler = await getHandler()
    for (const sender of [
      { id: "other", url: browser.runtime.getURL("/options.html") },
      { id: browser.runtime.id, url: "https://example.com/", tab: { id: 4 } },
      { id: browser.runtime.id, url: browser.runtime.getURL("/options.html"), frameId: 2 },
    ])
      handler({ data: { context: "options", records: [record] }, sender })
    expect(storeLogRecordsMock).not.toHaveBeenCalled()
  })
  it("re-sanitizes boundary payloads and rejects oversized batches", async () => {
    const handler = await getHandler()
    const sender = {
      id: browser.runtime.id,
      url: browser.runtime.getURL("/options.html"),
      frameId: 0,
    }
    handler({
      data: {
        context: "options",
        records: [
          {
            ...record,
            fields: {
              apiKey: "private-sentinel",
              responseBody: "body-sentinel",
              requestHeaders: { "X-Key": "header-sentinel" },
            },
          },
        ],
      },
      sender,
    })
    const json = JSON.stringify(storeLogRecordsMock.mock.calls)
    expect(json).not.toContain("private-sentinel")
    expect(json).not.toContain("body-sentinel")
    expect(json).not.toContain("header-sentinel")
    storeLogRecordsMock.mockClear()
    handler({
      data: {
        context: "options",
        records: [{ ...record, fields: { value: "x".repeat(300_000) } }],
      },
      sender,
    })
    expect(storeLogRecordsMock).not.toHaveBeenCalled()
  })
  it("allows diagnostics export only from trusted top-level settings/popup pages", async () => {
    await getHandler()
    const [, handler] = onMessageMock.mock.calls.find(([type]) => type === "getDiagnosticsReport")!
    expect(() =>
      handler({
        data: undefined,
        sender: { id: browser.runtime.id, url: "https://example.com/", tab: { id: 7 } },
      }),
    ).toThrow("Diagnostics export requires")
    expect(() =>
      handler({
        data: undefined,
        sender: {
          id: browser.runtime.id,
          url: browser.runtime.getURL("/options.html"),
          frameId: 3,
        },
      }),
    ).toThrow("Diagnostics export requires")
    expect(() =>
      handler({
        data: undefined,
        sender: {
          id: browser.runtime.id,
          url: browser.runtime.getURL("/options.html") + "#/help-and-community",
          frameId: 0,
        },
      }),
    ).not.toThrow()
  })
})
