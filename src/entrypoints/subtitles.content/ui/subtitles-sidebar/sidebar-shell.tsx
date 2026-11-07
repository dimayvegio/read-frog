import type { CSSProperties } from "react"
import type { SidebarResizeEdge } from "@/utils/subtitles/sidebar-window"
import { IconX, IconGripVertical, IconRestore, IconArrowsDiagonal } from "@tabler/icons-react"
import { useAtom, useSetAtom } from "jotai"
import { Button } from "@/components/ui/base-ui/button"
import { ScrollArea } from "@/components/ui/base-ui/scroll-area"
import { Tabs, TabsContent } from "@/components/ui/base-ui/tabs"
import { i18n } from "@/utils/i18n"
import { subtitlesSidebarActiveSectionAtom, subtitlesSidebarOpenAtom } from "../../atoms"
import { SECTIONS } from "./sections"
import { SidebarTabBar } from "./tab-bar"
import { useSidebarWindow } from "./use-sidebar-window"

const RESIZE_HANDLES: { edge: SidebarResizeEdge; style: CSSProperties }[] = [
  { edge: "n", style: { top: -4, left: 16, right: 16, height: 8, cursor: "ns-resize" } },
  { edge: "s", style: { bottom: -4, left: 16, right: 16, height: 8, cursor: "ns-resize" } },
  { edge: "w", style: { left: -4, top: 16, bottom: 16, width: 8, cursor: "ew-resize" } },
  { edge: "e", style: { right: -4, top: 16, bottom: 16, width: 8, cursor: "ew-resize" } },
  { edge: "nw", style: { top: -4, left: -4, width: 16, height: 16, cursor: "nwse-resize" } },
  { edge: "ne", style: { top: -4, right: -4, width: 16, height: 16, cursor: "nesw-resize" } },
  { edge: "sw", style: { bottom: -4, left: -4, width: 16, height: 16, cursor: "nesw-resize" } },
  { edge: "se", style: { bottom: -4, right: -4, width: 16, height: 16, cursor: "nwse-resize" } },
]

export function SidebarShell() {
  const [activeSection, setActiveSection] = useAtom(subtitlesSidebarActiveSectionAtom)
  const setOpen = useSetAtom(subtitlesSidebarOpenAtom)
  const { rootRef, helpId, start, move, end, key, reset } = useSidebarWindow()

  return (
    <div
      ref={rootRef}
      className="relative h-full text-popover-foreground"
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div
        data-slot="subtitles-sidebar"
        className="pointer-events-auto flex h-full flex-col overflow-hidden rounded-[20px] border border-border bg-popover/90 font-light text-popover-foreground shadow-lg backdrop-blur-2xl backdrop-saturate-150"
      >
        <Tabs
          value={activeSection}
          onValueChange={setActiveSection}
          className="min-h-0 flex-1 gap-0"
        >
          <div
            data-slot="sidebar-drag-header"
            className="flex touch-none items-center gap-1 border-b border-border px-2"
            style={{ cursor: "move" }}
            onPointerDown={(event) => start(event, "move")}
          >
            <Button
              type="button"
              variant="ghost-secondary"
              size="icon-sm"
              data-sidebar-move
              aria-label={i18n.t("subtitles.sidebar.moveWindow")}
              title={i18n.t("subtitles.sidebar.windowHelp")}
              aria-describedby={helpId}
              onKeyDown={key}
              className="size-6 shrink-0 cursor-grab touch-none rounded-full active:cursor-grabbing"
            >
              <IconGripVertical className="size-4" />
            </Button>
            <SidebarTabBar />
            <Button
              type="button"
              variant="ghost-secondary"
              size="icon-sm"
              aria-label={i18n.t("subtitles.sidebar.resetWindow")}
              title={i18n.t("subtitles.sidebar.resetWindow")}
              onClick={reset}
              className="size-6 shrink-0 rounded-full"
            >
              <IconRestore className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost-secondary"
              size="icon-sm"
              aria-label={i18n.t("subtitles.sidebar.close")}
              onClick={() => setOpen(false)}
              className="ml-auto size-6 shrink-0 rounded-full"
            >
              <IconX className="size-4" />
            </Button>
          </div>

          {SECTIONS.map(({ id, component: Section }) => (
            <TabsContent
              key={id}
              value={id}
              className="min-h-0 flex-1 animate-in duration-200 ease-out fade-in-0"
            >
              <ScrollArea className="h-full">
                <Section />
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      </div>
      <span id={helpId} className="sr-only">
        {i18n.t("subtitles.sidebar.windowHelp")}
      </span>
      {RESIZE_HANDLES.map(({ edge, style }) => (
        <button
          key={edge}
          type="button"
          tabIndex={-1}
          aria-label={i18n.t("subtitles.sidebar.resizeWindow")}
          title={i18n.t("subtitles.sidebar.resizeWindow")}
          data-slot="sidebar-resize-handle"
          data-edge={edge}
          onPointerDown={(event) => start(event, edge)}
          className="pointer-events-auto absolute z-20 touch-none border-0 bg-transparent p-0 hover:bg-primary/10"
          style={style}
        >
          {edge === "se" && (
            <IconArrowsDiagonal className="pointer-events-none absolute right-1 bottom-1 size-3 opacity-50" />
          )}
        </button>
      ))}
    </div>
  )
}
