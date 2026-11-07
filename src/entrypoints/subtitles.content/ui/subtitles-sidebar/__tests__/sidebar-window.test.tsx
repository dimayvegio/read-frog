// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { createPortal } from "react-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { SIDEBAR_WINDOW_STORAGE_KEY } from "@/utils/subtitles/sidebar-window"
import { SubtitlesSidebar } from ".."
import { subtitlesSidebarOpenAtom } from "../../../atoms"

vi.mock("../sections", () => ({
  SECTIONS: [
    {
      id: "transcript",
      title: () => "Transcript",
      icon: null,
      component: () => <p>Existing transcript</p>,
    },
    { id: "summary", title: () => "Summary", icon: null, component: () => <p>Existing summary</p> },
  ],
  DEFAULT_SECTION_ID: "transcript",
}))
class TestPointer extends MouseEvent {
  pointerId: number
  isPrimary: boolean
  constructor(type: string, options: PointerEventInit = {}) {
    super(type, options)
    this.pointerId = options.pointerId ?? 1
    this.isPrimary = options.isPrimary ?? true
  }
}
beforeEach(async () => {
  await browser.storage.local.clear()
  vi.stubGlobal("PointerEvent", TestPointer)
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => setTimeout(() => fn(0), 0))
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id))
  vi.stubGlobal("innerWidth", 1280)
  vi.stubGlobal("innerHeight", 800)
  window.matchMedia = vi.fn<(...args: any[]) => any>().mockReturnValue({ matches: true })
})
afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function fixture() {
  const host = document.createElement("div"),
    shadow = host.attachShadow({ mode: "open" })
  document.body.append(host)
  const store = createStore()
  store.set(subtitlesSidebarOpenAtom, true)
  await act(async () => {
    render(
      createPortal(
        <Provider store={store}>
          <SubtitlesSidebar />
        </Provider>,
        shadow,
      ),
    )
  })
  const grip = () => shadow.querySelector<HTMLButtonElement>("[data-sidebar-move]")!
  const handle = (edge: string) => shadow.querySelector<HTMLButtonElement>(`[data-edge="${edge}"]`)!
  return { host, shadow, store, grip, handle }
}
function drag(node: Element, dx: number, dy: number) {
  fireEvent.pointerDown(node, {
    button: 0,
    clientX: 100,
    clientY: 100,
    pointerId: 1,
    isPrimary: true,
  })
  fireEvent.pointerMove(node, { clientX: 100 + dx, clientY: 100 + dy, pointerId: 1 })
  fireEvent.pointerUp(node, { pointerId: 1 })
}
describe("learning window gestures", () => {
  it("moves/resizes using the real shell, keeps content mounted, and stores only window geometry", async () => {
    const { host, shadow, grip, handle } = await fixture()
    const transcript = shadow.querySelector("p")
    drag(grip(), -200, 60)
    expect(host.style.left).toBe("664px")
    expect(host.style.top).toBe("16px")
    drag(handle("s"), 0, -200)
    expect(host.style.height).toBe("568px")
    drag(grip(), 0, 60)
    expect(host.style.top).toBe("76px")
    expect(shadow.querySelector("p")).toBe(transcript)
    const stored = await browser.storage.local.get(SIDEBAR_WINDOW_STORAGE_KEY)
    expect(stored[SIDEBAR_WINDOW_STORAGE_KEY]).toEqual({
      version: 1,
      rect: { left: 664, top: 76, width: 400, height: 568 },
    })
  })
  it("restores on close/reopen and clamps on resize without losing the desktop preference", async () => {
    const { host, store, grip, handle } = await fixture()
    drag(handle("s"), 0, -300)
    drag(grip(), -600, 100)
    const left = host.style.left,
      top = host.style.top
    act(() => store.set(subtitlesSidebarOpenAtom, false))
    act(() => store.set(subtitlesSidebarOpenAtom, true))
    expect(host.style.left).toBe(left)
    expect(host.style.top).toBe(top)
    vi.stubGlobal("innerWidth", 390)
    fireEvent(window, new Event("resize"))
    expect(host.style.width).toBe("358px")
    expect(host.style.left).toBe("16px")
    vi.stubGlobal("innerWidth", 1280)
    fireEvent(window, new Event("resize"))
    expect(host.style.width).toBe("400px")
    expect(host.style.left).toBe(left)
  })
  it("does not start a drag on tabs/close buttons or a secondary pointer", async () => {
    const { host, shadow, grip } = await fixture()
    const before = host.style.cssText
    drag(shadow.querySelector('[role="tab"]')!, -100, 100)
    fireEvent.pointerDown(grip(), { button: 0, isPrimary: false, pointerId: 2 })
    fireEvent.pointerMove(grip(), { clientX: -400, clientY: 500, pointerId: 2 })
    expect(host.style.cssText).toBe(before)
  })
  it("supports keyboard movement/size and an accessible reset", async () => {
    const { host, grip, shadow } = await fixture()
    fireEvent.keyDown(grip(), { key: "ArrowLeft" })
    expect(host.style.left).toBe("854px")
    fireEvent.keyDown(grip(), { key: "ArrowLeft", shiftKey: true })
    expect(host.style.width).toBe("390px")
    fireEvent.click(shadow.querySelector('[aria-label="subtitles.sidebar.resetWindow"]')!)
    expect(host.style.left).toBe("864px")
    expect(host.style.width).toBe("400px")
    expect(
      (await browser.storage.local.get(SIDEBAR_WINDOW_STORAGE_KEY))[SIDEBAR_WINDOW_STORAGE_KEY],
    ).toBeUndefined()
  })
  it("does not apply a late stored preference over a drag which already started", async () => {
    let resolve!: (value: Record<string, unknown>) => void
    vi.spyOn(browser.storage.local, "get").mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }) as never,
    )
    const { host, grip } = await fixture()
    drag(grip(), -200, 0)
    await act(async () =>
      resolve({
        [SIDEBAR_WINDOW_STORAGE_KEY]: {
          version: 1,
          rect: { left: 20, top: 20, width: 700, height: 500 },
        },
      }),
    )
    expect(host.style.left).toBe("664px")
    expect(host.style.width).toBe("400px")
  })
})
