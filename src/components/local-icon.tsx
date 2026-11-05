import type { IconProps } from "@iconify/react/offline"
import { Icon as OfflineIcon } from "@iconify/react/offline"
import { getBundledIcon } from "@/utils/iconify/bundled-icons"

/** String IDs resolve exclusively against the packaged inventory. */
export function Icon({ icon, ...props }: IconProps) {
  return <OfflineIcon {...props} icon={typeof icon === "string" ? getBundledIcon(icon) : icon} />
}
