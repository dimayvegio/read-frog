// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://www.youtube.com/" }
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { YOUTUBE_NAVIGATE_FINISH_EVENT } from "@/utils/constants/subtitles"
import { initYoutubeSubtitles } from "../init-youtube-subtitles"

const mocks = vi.hoisted(() => ({
  createAdapter: vi.fn<(...args: any[]) => any>(),
  mountSubtitlesUI: vi.fn<(...args: any[]) => any>(),
  unmountSubtitlesUI: vi.fn<(...args: any[]) => any>(),
  mountSubtitlesSidebar: vi.fn<(...args: any[]) => any>(),
  unmountSubtitlesSidebar: vi.fn<(...args: any[]) => any>(),
  bindToggleShortcut: vi.fn<(...args: any[]) => any>(),
  unbindToggleShortcut: vi.fn<(...args: any[]) => any>(),
  createTrackListener: vi.fn<(...args: any[]) => any>(),
  trackListenerStart: vi.fn<(...args: any[]) => any>(),
  trackListenerStop: vi.fn<(...args: any[]) => any>(),
  watchShortsActiveReel: vi.fn<(...args: any[]) => any>(),
  unwatchShortsActiveReel: vi.fn<(...args: any[]) => any>(),
  createShortsButtonMount: vi.fn<(...args: any[]) => any>(),
  shortsButtonMount: vi.fn<(...args: any[]) => any>(),
  shortsButtonDispose: vi.fn<(...args: any[]) => any>(),
}))

vi.mock("../platforms/youtube", () => ({
  createYoutubeSubtitlesAdapter: mocks.createAdapter,
}))

vi.mock("../platforms/youtube/config", () => ({
  getYoutubeConfig: ({ mode = "watch" }: { mode?: string } = {}) => ({
    mode,
    embedded: mode !== "watch",
    supportsSidebar: mode === "watch",
    selectors: { video: "video", playerContainer: `#${mode}-player` },
    events: {},
  }),
}))

vi.mock("../platforms/youtube/caption-track-listener", () => ({
  createYoutubeCaptionTrackListener: mocks.createTrackListener,
}))

vi.mock("../platforms/youtube/shorts-active-reel-watcher", () => ({
  watchShortsActiveReel: mocks.watchShortsActiveReel,
}))

vi.mock("../renderer/mount-shorts-translate-button", () => ({
  createShortsTranslateButtonMount: mocks.createShortsButtonMount,
}))

vi.mock("../renderer/mount-subtitles-sidebar", () => ({
  mountSubtitlesSidebar: mocks.mountSubtitlesSidebar,
  unmountSubtitlesSidebar: mocks.unmountSubtitlesSidebar,
}))

vi.mock("../renderer/mount-subtitles-ui", () => ({
  mountSubtitlesUI: mocks.mountSubtitlesUI,
  unmountSubtitlesUI: mocks.unmountSubtitlesUI,
}))

vi.mock("../bind-subtitles-toggle-shortcut", () => ({
  bindSubtitlesToggleShortcut: mocks.bindToggleShortcut,
}))

vi.mock("@/utils/logger", () => ({
  logger: { error: vi.fn<(...args: any[]) => any>() },
}))

interface FakeAdapter {
  config: { mode: string }
  initialize: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  notifyNavigation: ReturnType<typeof vi.fn>
  handleSourceTrackChanged: ReturnType<typeof vi.fn>
}

function createFakeAdapter(config: { mode: string }): FakeAdapter {
  return {
    config,
    initialize: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    destroy: vi.fn<(...args: any[]) => any>(),
    notifyNavigation: vi.fn<(...args: any[]) => any>(),
    handleSourceTrackChanged: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  }
}

const invalidationCallbacks: Array<() => void> = []

function init() {
  initYoutubeSubtitles({
    onInvalidated: (callback: () => void) => {
      invalidationCallbacks.push(callback)
    },
  } as any)
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

async function loadAt(path: string) {
  window.history.pushState({}, "", path)
  init()
  await flush()
}

async function navigateTo(path: string) {
  window.history.pushState({}, "", path)
  window.dispatchEvent(new Event(YOUTUBE_NAVIGATE_FINISH_EVENT))
  await flush()
}

function adapters(): FakeAdapter[] {
  return mocks.createAdapter.mock.results.map((result) => result.value as FakeAdapter)
}

describe("initYoutubeSubtitles", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createAdapter.mockImplementation((config: { mode: string }) => createFakeAdapter(config))
    mocks.mountSubtitlesUI.mockResolvedValue(undefined)
    mocks.bindToggleShortcut.mockResolvedValue(mocks.unbindToggleShortcut)
    mocks.createTrackListener.mockImplementation(() => ({
      start: mocks.trackListenerStart,
      stop: mocks.trackListenerStop,
    }))
    mocks.watchShortsActiveReel.mockReturnValue(mocks.unwatchShortsActiveReel)
    mocks.createShortsButtonMount.mockImplementation((adapter: FakeAdapter) => ({
      adapter,
      mount: mocks.shortsButtonMount,
      dispose: mocks.shortsButtonDispose,
    }))
  })

  afterEach(() => {
    for (const callback of invalidationCallbacks.splice(0)) callback()
    vi.unstubAllGlobals()
  })

  it.each([
    "https://embed.settlar.io/embed/v1?t=synthetic",
    "https://ani.pm/embed/v1",
    "https://courses.edx.org/embed/video",
    "https://notyoutube.com/embed/video",
    "https://youtube.com.evil.invalid/embed/video",
    "https://www.youtube-nocookie.com.evil.invalid/embed/video",
    "https://foreign.invalid/youtube.com/watch?v=synthetic",
    "https://foreign.invalid/shorts/video",
    "https://foreign.invalid/live/video",
  ])("does not start a YouTube session or listen for its events on %s", async (url) => {
    const addEventListener = vi.fn<() => void>()
    vi.stubGlobal("window", {
      location: new URL(url),
      addEventListener,
      removeEventListener: vi.fn<() => void>(),
    })
    init()
    await flush()
    expect(mocks.createAdapter).not.toHaveBeenCalled()
    expect(mocks.mountSubtitlesUI).not.toHaveBeenCalled()
    expect(mocks.bindToggleShortcut).not.toHaveBeenCalled()
    expect(addEventListener).not.toHaveBeenCalled()
    expect(invalidationCallbacks).toHaveLength(0)
  })

  it.each([
    "https://youtube.com/embed/video",
    "https://www.youtube.com/embed/video",
    "https://m.youtube.com/embed/video",
    "https://youtube-nocookie.com/embed/video",
    "https://www.youtube-nocookie.com/embed/video",
  ])("keeps genuine YouTube embeds working on %s", async (url) => {
    vi.stubGlobal("window", {
      location: new URL(url),
      addEventListener: vi.fn<() => void>(),
      removeEventListener: vi.fn<() => void>(),
    })
    init()
    await flush()
    expect(mocks.createAdapter).toHaveBeenCalledOnce()
    expect(adapters()[0]?.config.mode).toBe("embed")
    expect(adapters()[0]?.initialize).toHaveBeenCalledOnce()
  })

  it("mounts the Shorts button when a navigation enters Shorts from the feed", async () => {
    await loadAt("/")
    expect(mocks.createAdapter).not.toHaveBeenCalled()

    await navigateTo("/shorts/abc123")

    const [adapter] = adapters()
    expect(adapter?.config.mode).toBe("shorts")
    expect(mocks.mountSubtitlesUI).toHaveBeenCalledWith(
      expect.objectContaining({ adapter, menuBelow: true }),
    )
    expect(mocks.createShortsButtonMount).toHaveBeenCalledWith(adapter)
    expect(mocks.shortsButtonMount).toHaveBeenCalled()
    expect(mocks.watchShortsActiveReel).toHaveBeenCalled()
    expect(adapter?.initialize).toHaveBeenCalled()
  })

  it("replaces the watch session with a Shorts one and back again", async () => {
    await loadAt("/watch?v=first")
    const [watchAdapter] = adapters()
    expect(watchAdapter?.config.mode).toBe("watch")
    expect(mocks.mountSubtitlesSidebar).toHaveBeenCalledWith(watchAdapter)

    await navigateTo("/shorts/abc123")

    const [, shortsAdapter] = adapters()
    expect(shortsAdapter?.config.mode).toBe("shorts")
    expect(watchAdapter?.destroy).toHaveBeenCalledOnce()
    expect(mocks.unmountSubtitlesUI).toHaveBeenCalled()
    expect(mocks.unmountSubtitlesSidebar).toHaveBeenCalled()
    expect(mocks.trackListenerStop).toHaveBeenCalledOnce()
    expect(mocks.unbindToggleShortcut).toHaveBeenCalledOnce()
    // The old adapter is gone before the new one touches the page.
    expect(watchAdapter!.destroy.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createAdapter.mock.invocationCallOrder[1]!,
    )
    expect(mocks.createShortsButtonMount).toHaveBeenCalledWith(shortsAdapter)

    await navigateTo("/watch?v=second")

    const [, , nextWatchAdapter] = adapters()
    expect(nextWatchAdapter?.config.mode).toBe("watch")
    expect(shortsAdapter?.destroy).toHaveBeenCalledOnce()
    expect(mocks.shortsButtonDispose).toHaveBeenCalledOnce()
    expect(mocks.unwatchShortsActiveReel).toHaveBeenCalledOnce()
    expect(mocks.mountSubtitlesSidebar).toHaveBeenLastCalledWith(nextWatchAdapter)
  })

  it("keeps the adapter across navigation within the same layout", async () => {
    await loadAt("/watch?v=first")
    await navigateTo("/watch?v=second")

    expect(mocks.createAdapter).toHaveBeenCalledOnce()
    expect(adapters()[0]?.destroy).not.toHaveBeenCalled()
    // The overlay is re-checked against the player on every navigation.
    expect(mocks.mountSubtitlesUI).toHaveBeenCalledTimes(2)
  })

  it("leaves the session alone on pages without a player", async () => {
    await loadAt("/watch?v=first")
    await navigateTo("/feed/subscriptions")

    expect(mocks.createAdapter).toHaveBeenCalledOnce()
    expect(adapters()[0]?.destroy).not.toHaveBeenCalled()

    await navigateTo("/shorts/abc123")

    expect(adapters()[0]?.destroy).toHaveBeenCalledOnce()
    expect(adapters()[1]?.config.mode).toBe("shorts")
  })

  it("does not follow navigation inside an embed", async () => {
    await loadAt("/embed/abc123")
    expect(adapters()[0]?.config.mode).toBe("embed")

    await navigateTo("/watch?v=first")

    expect(mocks.createAdapter).toHaveBeenCalledOnce()
    expect(adapters()[0]?.destroy).not.toHaveBeenCalled()
  })

  it("tears the Shorts session down when the content script is invalidated", async () => {
    await loadAt("/shorts/abc123")
    const [adapter] = adapters()

    for (const callback of invalidationCallbacks.splice(0)) callback()

    expect(adapter?.destroy).toHaveBeenCalledOnce()
    expect(mocks.shortsButtonDispose).toHaveBeenCalledOnce()
    expect(mocks.unwatchShortsActiveReel).toHaveBeenCalledOnce()
    expect(mocks.unmountSubtitlesUI).toHaveBeenCalled()
  })
})
