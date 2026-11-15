import { IconSubtitles } from "@tabler/icons-react"
import { useAtomValue } from "jotai"
import { Switch } from "@/components/ui/base-ui/switch"
import { APP_NAME } from "@/utils/constants/app"
import { i18n } from "@/utils/i18n"
import { subtitlesVisibleAtom } from "../../../atoms"
import { useSmartVideo } from "../../smart-video-context"
import { useSubtitlesUI } from "../../subtitles-ui-context"
import { SubtitlesSettingsItem } from "./subtitles-settings-item"

export function SubtitlesToggle() {
  const title = `${APP_NAME} ${i18n.t("options.videoSubtitles.title")}`
  const switchId = "read-frog-subtitles-toggle"

  const isVisible = useAtomValue(subtitlesVisibleAtom)
  const { toggleSubtitles, getSmartProfile } = useSubtitlesUI()
  const smart = useSmartVideo()

  return (
    <SubtitlesSettingsItem
      icon={<IconSubtitles className="size-3.5" />}
      label={title}
      labelFor={switchId}
    >
      <Switch
        id={switchId}
        checked={isVisible}
        onCheckedChange={(checked) => {
          if (!checked) {
            smart?.cancel()
            toggleSubtitles(false)
          } else if (smart?.enabled && !smart.profile) {
            void smart.prepare().then((ready) => {
              if (ready && getSmartProfile?.()) toggleSubtitles(true)
            })
          } else toggleSubtitles(true)
        }}
        aria-label={title}
      />
    </SubtitlesSettingsItem>
  )
}
