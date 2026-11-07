import { IconDownload, IconPlayerStopFilled } from "@tabler/icons-react"
import { useAtomValue } from "jotai"
import { Button } from "@/components/ui/base-ui/button"
import { useOpenAITTSDownload } from "@/hooks/use-openai-tts-download"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { i18n } from "@/utils/i18n"

export function DownloadTTSButton({
  text,
  showLabel = false,
}: {
  text: string | undefined
  showLabel?: boolean
}) {
  const tts = useAtomValue(configFieldsAtomMap.tts)
  if (tts.provider !== "openai") return null
  return <OpenAIDownloadButton text={text} showLabel={showLabel} />
}

function OpenAIDownloadButton({
  text,
  showLabel,
}: {
  text: string | undefined
  showLabel: boolean
}) {
  const { download, cancel, progress, available } = useOpenAITTSDownload(text)
  if (!available) return null
  const label =
    progress?.phase === "saving"
      ? i18n.t("openaiTts.downloadSaving")
      : progress
        ? i18n.t("openaiTts.downloadCancel")
        : i18n.t("openaiTts.download")
  const title =
    progress?.phase === "generating" ? `${label} (${progress.current}/${progress.total})` : label
  return (
    <Button
      type="button"
      variant="ghost-secondary"
      size={showLabel ? "sm" : "icon-sm"}
      title={title}
      aria-label={label}
      data-tts-download
      data-phase={progress?.phase ?? "idle"}
      disabled={!text?.trim() || progress?.phase === "saving"}
      onClick={() => {
        if (progress) cancel()
        else void download()
      }}
    >
      {progress ? <IconPlayerStopFilled /> : <IconDownload />}
      {showLabel && title}
    </Button>
  )
}
