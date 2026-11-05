import { useAtom } from "jotai"
import { OPENAI_PROVIDER_ID } from "@/types/config/openai"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { ConfigSection } from "../../../components/config-section"

export function LanguageDetectionConfig() {
  const [config, setConfig] = useAtom(configFieldsAtomMap.languageDetection)
  return (
    <ConfigSection id="language-detection" title="Language detection">
      <p className="text-sm text-muted-foreground">
        Local detection works without an API key. Optional OpenAI detection falls back locally when
        unavailable, including for Microsoft TTS.
      </p>
      <div className="flex gap-6">
        <label className="flex gap-2">
          <input
            type="radio"
            name="language-detection-mode"
            checked={config.mode === "basic"}
            onChange={() => {
              void setConfig({ mode: "basic" })
            }}
          />
          Local
        </label>
        <label className="flex gap-2">
          <input
            type="radio"
            name="language-detection-mode"
            checked={config.mode === "llm"}
            onChange={() => {
              void setConfig({ mode: "llm", providerId: OPENAI_PROVIDER_ID })
            }}
          />
          OpenAI
        </label>
      </div>
    </ConfigSection>
  )
}
