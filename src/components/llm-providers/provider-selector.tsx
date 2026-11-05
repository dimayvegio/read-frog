import type { ComponentProps } from "react"
import type { SelectContent, SelectTrigger } from "@/components/ui/base-ui/select"
import type { ProviderSelectorOption } from "@/utils/providers/provider-display"
import ProviderIcon from "@/components/provider-icon"
import { sendMessage } from "@/utils/message"
import { cn } from "@/utils/styles/utils"

type ProviderSelectorTriggerSize = ComponentProps<typeof SelectTrigger>["size"]
interface ProviderSelectorProps {
  providers: ProviderSelectorOption[]
  value: string
  placeholder?: string
  className?: string
  /** Applied to the selected provider's name in the trigger, not to the list items. */
  triggerNameClassName?: string
  triggerSize?: ProviderSelectorTriggerSize
  selectContentProps?: Pick<
    ComponentProps<typeof SelectContent>,
    "container" | "positionerClassName" | "align"
  >
}

export default function ProviderSelector({
  providers,
  value,
  className,
  triggerNameClassName,
}: ProviderSelectorProps) {
  const provider = providers.find((item) => item.id === value)
  return (
    <button
      type="button"
      className={cn("flex min-w-0 items-center rounded border px-2 py-1 text-sm", className)}
      title="OpenAI model settings"
      onClick={() => {
        void sendMessage("openOptionsPage", { route: "/api-providers" })
      }}
    >
      <ProviderIcon
        name={provider?.name ?? "OpenAI"}
        textClassName={triggerNameClassName}
        size="sm"
      />
    </button>
  )
}
