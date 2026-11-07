import { Icon } from "@/components/local-icon"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
import { openOptionsPage } from "@/utils/navigation"
import { version } from "../../../package.json"
import { AISmartContext } from "./components/ai-smart-context"
import { AlwaysTranslate } from "./components/always-translate"
import { ImageTranslationButton } from "./components/image-translation-button"
import LanguageOptionsSelector from "./components/language-options-selector"
import { MoreMenu } from "./components/more-menu"
import Hotkey from "./components/node-translation-hotkey-selector"
import { PdfPanelButton } from "./components/pdf-panel-button"
import ProvidersField from "./components/providers-field"
import { SiteControlToggle } from "./components/site-control-toggle"
import { StudyHighlightsSwitch } from "./components/study-highlights-switch"
import TranslateButton from "./components/translate-button"
import TranslatePromptSelector from "./components/translate-prompt-selector"
import { TranslationHubButton } from "./components/translation-hub-button"
import TranslationModeSelector from "./components/translation-mode-selector"

function App() {
  return (
    <>
      <div className="relative">
        <div className="flex flex-col gap-4 bg-background px-6 pt-5 pb-4">
          {/* gap-2 + a non-shrinking icon rail is what bounds the account menu:
              whatever is left of the 320px popup is its width, and a long display
              name ellipses inside that instead of pushing the icons off. */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">Read Frog</span>
            <div className="flex shrink-0 items-center">
              <PdfPanelButton />
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs hover:bg-muted"
                onClick={() => void sendMessage("openVocabulary", undefined)}
              >
                Sổ từ
              </button>
              <TranslationHubButton />
            </div>
          </div>
          <LanguageOptionsSelector />
          <ProvidersField />
          <TranslatePromptSelector />
          <div className="flex w-full items-center gap-2">
            <TranslationModeSelector />
            <TranslateButton className="min-w-0 flex-1" />
          </div>
          <SiteControlToggle />
          <AlwaysTranslate />
          <Hotkey />
          <AISmartContext />
          <StudyHighlightsSwitch />
          <button
            type="button"
            className="text-left text-[13px] underline"
            onClick={() => void sendMessage("openReadingLab", undefined)}
          >
            {i18n.t("readingLab.library")}
          </button>
          <button
            type="button"
            className="text-left text-[13px] underline"
            onClick={() => void sendMessage("openUsageDashboard", undefined)}
          >
            Chi phí và tốc độ OpenAI
          </button>
          <button
            type="button"
            className="text-left text-[13px] underline"
            onClick={() => void sendMessage("openSettingsSync", undefined)}
          >
            Đồng bộ cấu hình Edge
          </button>
        </div>
        {/* Out of flow on purpose: the card appears on its own schedule, and letting it
            grow the popup would shift every control out from under the user's cursor. */}
      </div>
      <ImageTranslationButton />
      <div className="flex items-center justify-between bg-neutral-200 px-2 py-1 dark:bg-neutral-800">
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 hover:bg-neutral-300 dark:hover:bg-neutral-700"
          onClick={() => {
            void openOptionsPage()
          }}
        >
          <Icon icon="tabler:settings" className="size-4" strokeWidth={1.6} />
          <span className="text-[13px] font-medium">{i18n.t("popup.options")}</span>
        </button>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{version}</span>
        <MoreMenu />
      </div>
    </>
  )
}

export default App
