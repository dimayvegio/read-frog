import type { Config } from "@/types/config/config"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { getDefaultStore } from "jotai"
// @vitest-environment jsdom
import React from "react"
import { beforeEach, afterEach, it, expect, vi } from "vitest"
import { clearAiCache } from "@/utils/ai-cache/db"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { PdfPageSummaryModal } from "../../pdf-reader/page-summary"
import { QuickDictionaryPopover } from "../../pdf-reader/quick-dictionary"
import { PdfViewport } from "../../pdf-reader/viewport"
import { SelectionTranslation } from "../app"
await vi.hoisted(async () => {
  const fake = await import("fake-indexeddb")
  Object.assign(globalThis, { indexedDB: fake.indexedDB, IDBKeyRange: fake.IDBKeyRange })
})
const mocks = vi.hoisted(() => ({
  current: null as any,
  translate: vi.fn<(...args: any[]) => any>(),
  stream: vi.fn<(...args: any[]) => any>(),
  send: vi.fn<(...args: any[]) => any>(),
}))
vi.mock("@/utils/atoms/config", async () => {
  const { atom } = await import("jotai")
  return { configFieldsAtomMap: { language: atom({ targetCode: "vi" }) } }
})
vi.mock("@/utils/message", () => ({ sendMessage: mocks.send }))
vi.mock("@/utils/selection-result/translate", () => ({ translateNativeSelection: mocks.translate }))
vi.mock("@/utils/content-script/background-stream-client", () => ({
  streamBackgroundText: mocks.stream,
}))
vi.mock("@/utils/config/storage", () => ({ getLocalConfig: async () => mocks.current }))
vi.mock("@/utils/providers/provider-registry", () => ({
  resolveProviderRefForCapability: () => ({ config: { id: "openai" } }),
}))
vi.mock("@/components/ui/selection-popover", () => ({
  SelectionPopover: { Root: ({ children }: any) => children, Close: () => null },
}))
vi.mock("../pdf-history-panel", () => ({
  PdfHistoryPanel: () => null,
  pdfLanguageName: (s: string) => s,
}))
vi.mock(
  "@/entrypoints/content-runtime/selection/selection-toolbar/translate-button/target-language-selector",
  () => ({ TargetLanguageSelector: () => null }),
)
vi.mock(
  "@/entrypoints/content-runtime/selection/selection-toolbar/translate-button/translation-content",
  () => ({ TranslationContent: ({ translatedText }: any) => <div>{translatedText}</div> }),
)
vi.mock("@/components/ui/selection-popover/selection-toolbar-footer-content", () => ({
  SelectionToolbarFooterContent: () => null,
}))
vi.mock("@/components/markdown-renderer", () => ({
  MarkdownRenderer: ({ content }: any) => <div>{content}</div>,
}))
vi.mock("@/components/ui/selection-popover/selection-toolbar-title-content", () => ({
  SelectionToolbarTitleContent: () => null,
}))
vi.mock("@/hooks/use-text-to-speech", () => ({
  useTextToSpeech: () => ({
    play: () => Promise.resolve(),
    stop: () => {},
    isFetching: false,
    isPlaying: false,
  }),
  selectTTSVoice: () => undefined,
}))
const request = {
  id: "test",
  text: "The same technical paragraph",
  tooLong: false,
  createdAt: 1,
  document: { id: "a".repeat(64), title: "guide.pdf" },
}
const config: Config = {
  ...DEFAULT_CONFIG,
  language: { ...DEFAULT_CONFIG.language, targetCode: "vi" },
}
const props = {
  request,
  config,
  panel: true,
  embedded: true,
  textOptions: { clean: true, joinHyphenatedWords: false },
  onTextOptions: () => {},
}
beforeEach(async () => {
  vi.clearAllMocks()
  mocks.current = config
  cleanup()
  await clearAiCache()
  getDefaultStore().set(configFieldsAtomMap.language as any, { targetCode: "vi" })
  mocks.send.mockImplementation(async (name: string) =>
    name === "getVocabularyStudySnapshot" ? { words: [] } : { revision: 1 },
  )
  mocks.translate.mockResolvedValue({ output: "Bản dịch tiếng Việt", thinking: null })
  mocks.stream.mockResolvedValue({ output: "", thinking: null })
})
afterEach(cleanup)
it("must rerun selection translation after target language changes", async () => {
  render(<SelectionTranslation {...props} />)
  await screen.findByText("Bản dịch tiếng Việt")
  act(() => getDefaultStore().set(configFieldsAtomMap.language as any, { targetCode: "ja" }))
  await waitFor(() => expect(mocks.translate).toHaveBeenCalledTimes(2), { timeout: 600 })
})
it("must not accept aborted partial translation as a finished cache hit", async () => {
  mocks.translate.mockImplementation((p: any) => {
    p.onChunk({ output: "Incomplete first fragment", thinking: null })
    return new Promise(() => {})
  })
  render(<SelectionTranslation {...props} />)
  await screen.findByText("Incomplete first fragment")
  fireEvent.click(screen.getByRole("button", { name: "selectionResult.technicalExplain" }))
  await waitFor(() => expect(mocks.stream).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole("button", { name: "selectionResult.translateTab" }))
  await waitFor(() => expect(mocks.translate).toHaveBeenCalledTimes(2), { timeout: 600 })
})
it("must not persist explanation fragments when the user switches tabs", async () => {
  mocks.stream.mockImplementation((_p: any, opts: any) => {
    opts.onChunk({ output: "Half an explanation", thinking: null })
    return new Promise(() => {})
  })
  render(<SelectionTranslation {...props} />)
  await screen.findByText("Bản dịch tiếng Việt")
  fireEvent.click(screen.getByRole("button", { name: "selectionResult.technicalExplain" }))
  await screen.findByText("Half an explanation")
  fireEvent.click(screen.getByRole("button", { name: "selectionResult.sectionSummary" }))
  await waitFor(() => expect(mocks.stream).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByRole("button", { name: "selectionResult.technicalExplain" }))
  await waitFor(() => expect(mocks.stream).toHaveBeenCalledTimes(3), { timeout: 600 })
})
it("must reset saved state when quick dictionary target changes", async () => {
  let seen = false
  mocks.send.mockImplementation(async (name: string) => {
    if (name !== "getVocabularyStudySnapshot") return { revision: 1 }
    if (!seen) {
      seen = true
      return { words: [{ variants: ["alpha"], meaning: "First word", context: "example" }] }
    }
    return { words: [] }
  })
  mocks.stream.mockImplementation(async (_p: any, o: any) => {
    o.onChunk({ output: '{"meaning":"Second word"}' })
    return { output: '{"meaning":"Second word"}' }
  })
  const q = {
    word: "alpha",
    rect: { top: 200, bottom: 220, left: 20, right: 80, width: 60, height: 20 },
    context: "context",
    page: 1,
  }
  const view = render(
    <QuickDictionaryPopover
      target={q}
      documentId={"a".repeat(64)}
      documentTitle="Guide"
      config={config}
      onClose={() => {}}
    />,
  )
  await screen.findByText("First word")
  view.rerender(
    <QuickDictionaryPopover
      target={{ ...q, word: "beta" }}
      documentId={"a".repeat(64)}
      documentTitle="Guide"
      config={config}
      onClose={() => {}}
    />,
  )
  await screen.findByText("Second word")
  expect(document.querySelector(".rf-quick-dict-save-btn")).not.toBeDisabled()
})
it("must regenerate page summary after language configuration changes", async () => {
  const pdf = {
    getPage: async () => ({
      getTextContent: async () => ({
        items: [{ str: "A sufficiently long technical specification for summary generation." }],
      }),
    }),
  }
  mocks.stream.mockImplementation(async (_p: any, o: any) => {
    o.onChunk({ output: "Cached summary in Vietnamese" })
    return { output: "Cached summary in Vietnamese" }
  })
  const summaryProps = {
    documentId: "a".repeat(64),
    viewport: { ocrCache: { get: async () => undefined } } as any,
  }
  const view = render(
    <PdfPageSummaryModal
      {...summaryProps}
      pdf={pdf as any}
      page={1}
      config={config}
      onClose={() => {}}
    />,
  )
  await screen.findByText("Cached summary in Vietnamese")
  mocks.current = { ...config, language: { ...config.language, targetCode: "en" } }
  view.rerender(
    <PdfPageSummaryModal
      {...summaryProps}
      pdf={pdf as any}
      page={1}
      config={mocks.current}
      onClose={() => {}}
    />,
  )
  await waitFor(() => expect(mocks.stream).toHaveBeenCalledTimes(2), { timeout: 600 })
})
it("must preserve the PDF's intrinsic page rotation", async () => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as any
  const viewport = vi.fn<(...args: any[]) => any>((opts: any) => ({
    width: opts.rotation === 90 ? 800 : 600,
    height: opts.rotation === 90 ? 600 : 800,
  }))
  const page = { rotate: 90, getViewport: viewport, cleanup: () => {} }
  const host = document.createElement("div")
  const vp = new PdfViewport(
    host,
    { numPages: 1, getPage: async () => page } as any,
    () => {},
    () => {},
    "f".repeat(64),
  )
  await vp.init()
  vp.destroy()
  expect(viewport.mock.calls[0]?.[0].rotation ?? 90).toBe(90)
})

it("rejects malformed dictionary wire data without an automatic paid retry", async () => {
  mocks.stream.mockImplementation(async (_p: any, options: any) => {
    options.onChunk({ output: '{"meaning":{"bad":"shape"}}' })
    return { output: '{"meaning":{"bad":"shape"}}' }
  })
  render(
    <QuickDictionaryPopover
      target={{
        word: "wire",
        context: "hardware wire",
        page: 1,
        rect: { top: 200, bottom: 220, left: 20, right: 80, width: 60, height: 20 },
      }}
      documentId={"a".repeat(64)}
      documentTitle="Guide"
      config={config}
      onClose={() => {}}
    />,
  )
  await waitFor(() => expect(document.querySelector(".rf-quick-dict-error")).not.toBeNull())
  expect(mocks.stream).toHaveBeenCalledTimes(1)
})
