import { browser } from "#imports"
import { Icon } from "@/components/local-icon"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/base-ui/dropdown-menu"
import { toastManager } from "@/components/ui/base-ui/toast"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
import { openOptionsPage } from "@/utils/navigation"

async function diagnoseCurrentPage() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (tab?.id === undefined) throw new Error("No active tab")
    await sendMessage("togglePageTranslationDiagnostics", undefined, { tabId: tab.id, frameId: 0 })
    window.close()
  } catch {
    toastManager.add({ type: "error", title: i18n.t("pageDiagnosis.unavailable") })
  }
}
export function MoreMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" className="p-1" aria-label="More options" />}
      >
        <Icon icon="tabler:dots" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => void diagnoseCurrentPage()}>
          <Icon icon="tabler:stethoscope" /> {i18n.t("popup.more.diagnosePage")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void openOptionsPage({ route: "/api-providers" })
          }}
        >
          OpenAI settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void openOptionsPage({ route: "/tts" })
          }}
        >
          Text to speech
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void openOptionsPage({ route: "/preference" })
          }}
        >
          Import and export settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
