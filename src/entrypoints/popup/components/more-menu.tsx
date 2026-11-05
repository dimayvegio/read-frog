import { Icon } from "@/components/local-icon"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/base-ui/dropdown-menu"
import { openOptionsPage } from "@/utils/navigation"

export function MoreMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" className="p-1" aria-label="More options" />}
      >
        <Icon icon="tabler:dots" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
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
          Microsoft text-to-speech
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
