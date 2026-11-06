import { IconPlayerPlayFilled, IconPlayerStopFilled } from "@tabler/icons-react"
import { useAtom } from "jotai"
import { useState } from "react"
import { z } from "zod"
import { Button } from "@/components/ui/base-ui/button"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/base-ui/select"
import { Textarea } from "@/components/ui/base-ui/textarea"
import { useTextToSpeech } from "@/hooks/use-text-to-speech"
import { OPENAI_TTS_MODELS, OPENAI_TTS_VOICES } from "@/types/openai-tts"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
import { ConfigItem } from "../../components/config-item"
import { ConfigSection } from "../../components/config-section"
import { SpeechDialInput } from "./speech"

const PROVIDERS = [
  { value: "microsoft", label: "Microsoft / Edge TTS" },
  { value: "openai", label: "OpenAI" },
] as const
const MODELS = OPENAI_TTS_MODELS.map((value) => ({ value, label: value }))
const VOICES = OPENAI_TTS_VOICES.map((value) => ({ value, label: value }))
const speedSchema = z.coerce.number().min(0.25).max(1.5)

export function TTSProviderSection() {
  const [tts, setTts] = useAtom(configFieldsAtomMap.tts)
  return (
    <ConfigSection id="tts-provider" title={i18n.t("openaiTts.provider")}>
      <ConfigItem
        id="tts-provider-item"
        title={i18n.t("openaiTts.provider")}
        description={i18n.t("openaiTts.providerDescription")}
      >
        <Select
          value={tts.provider}
          items={PROVIDERS}
          onValueChange={(value) => {
            if (value) void setTts({ provider: value })
          }}
        >
          <SelectTrigger id="tts-provider-choice" className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ConfigItem>
    </ConfigSection>
  )
}

export function OpenAITTSSection() {
  const [tts, setTts] = useAtom(configFieldsAtomMap.tts)
  const [sample, setSample] = useState(() => i18n.t("options.tts.voice.language.previewSample"))
  const { play, stop, isFetching, isPlaying } = useTextToSpeech()
  const busy = isFetching || isPlaying
  return (
    <ConfigSection id="openai-tts" title="OpenAI TTS">
      <p className="text-sm text-muted-foreground">{i18n.t("openaiTts.description")}</p>
      <ConfigItem
        id="openai-tts-key"
        title={i18n.t("openaiTts.key")}
        description={i18n.t("openaiTts.keyDescription")}
      >
        <Button
          variant="outline"
          onClick={() => {
            void sendMessage("openOptionsPage", { route: "/api-providers" })
          }}
        >
          {i18n.t("openaiTts.settings")}
        </Button>
      </ConfigItem>
      <ConfigItem
        id="openai-tts-model-item"
        title={i18n.t("openaiTts.model")}
        description={i18n.t("openaiTts.modelDescription")}
      >
        <Select
          value={tts.openai.model}
          items={MODELS}
          onValueChange={(model) => {
            if (model) void setTts((current) => ({ openai: { ...current.openai, model } }))
          }}
        >
          <SelectTrigger id="openai-tts-model" className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODELS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ConfigItem>
      <ConfigItem id="openai-tts-voice-item" title={i18n.t("openaiTts.voice")}>
        <Select
          value={tts.openai.voice}
          items={VOICES}
          onValueChange={(voice) => {
            if (voice) void setTts((current) => ({ openai: { ...current.openai, voice } }))
          }}
        >
          <SelectTrigger id="openai-tts-voice" className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VOICES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ConfigItem>
      <ConfigItem
        id="openai-tts-speed"
        title={i18n.t("openaiTts.speed")}
        description={i18n.t("openaiTts.speedDescription")}
      >
        <SpeechDialInput
          value={tts.openai.speed}
          min={0.25}
          max={1.5}
          step={0.05}
          schema={speedSchema}
          onValue={(speed) => {
            void setTts((current) => ({ openai: { ...current.openai, speed } }))
          }}
        />
      </ConfigItem>
      <ConfigItem
        id="openai-tts-instructions-item"
        title={i18n.t("openaiTts.instructions")}
        description={i18n.t("openaiTts.instructionsDescription")}
        orientation="vertical"
      >
        <Textarea
          id="openai-tts-instructions"
          value={tts.openai.instructions}
          maxLength={1000}
          onChange={(event) => {
            const instructions = event.target.value
            void setTts((current) => ({ openai: { ...current.openai, instructions } }))
          }}
          rows={3}
        />
      </ConfigItem>
      <ConfigItem
        id="openai-tts-preview-item"
        title={i18n.t("openaiTts.preview")}
        orientation="vertical"
      >
        <Textarea
          id="openai-tts-preview"
          value={sample}
          maxLength={1000}
          onChange={(event) => setSample(event.target.value)}
          rows={3}
        />
        <Button
          onClick={() => {
            if (busy) stop()
            else void play(sample, tts).catch(() => {})
          }}
          disabled={!sample.trim()}
        >
          {busy ? <IconPlayerStopFilled /> : <IconPlayerPlayFilled />}
          {busy ? i18n.t("openaiTts.stop") : i18n.t("openaiTts.preview")}
        </Button>
      </ConfigItem>
    </ConfigSection>
  )
}
