import type { NavigateToSubpage } from "."
import { IconFileDownload, IconLoader2, IconSettings } from "@tabler/icons-react"
import { useAtomValue } from "jotai"
import { translatedSubtitlesDownloadStatusAtom } from "../../../atoms"
import { useSubtitlesUI } from "../../subtitles-ui-context"
import { SubtitlesSidebarItem } from "../components/subtitles-sidebar-item"
import { SubtitlesToggle } from "../components/subtitles-toggle"
import { isTranslatedDownloadRunning } from "../components/use-download-translated-subtitles"
import { SubpageLink } from "./subpage-link"

function DownloadLink({ onNavigate }: { onNavigate: NavigateToSubpage }) {
  // A translated download can run for minutes; the spinner keeps it visible after leaving its page.
  const { phase } = useAtomValue(translatedSubtitlesDownloadStatusAtom)

  return (
    <SubpageLink
      id="download"
      icon={
        isTranslatedDownloadRunning(phase) ? (
          <IconLoader2 className="size-3.5 animate-spin" />
        ) : (
          <IconFileDownload className="size-3.5" />
        )
      }
      onNavigate={onNavigate}
    />
  )
}

export function MainMenu({ onNavigate }: { onNavigate: NavigateToSubpage }) {
  const { getViewerContext } = useSubtitlesUI()
  return (
    <div className="p-1">
      <div className="space-y-0.5">
        <SubtitlesToggle />
        {getViewerContext?.() !== undefined && (
          <SubpageLink
            id="anime-context"
            icon={<IconSettings className="size-3.5" />}
            onNavigate={onNavigate}
          />
        )}
        <DownloadLink onNavigate={onNavigate} />
        <SubtitlesSidebarItem />
        <SubpageLink
          id="settings"
          icon={<IconSettings className="size-3.5" />}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  )
}
