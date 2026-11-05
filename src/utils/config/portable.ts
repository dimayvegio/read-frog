import type { Config } from "@/types/config/config"
import { configSchema } from "@/types/config/config"
import { openAIPublicConfigSchema } from "@/types/config/openai"
import { normalizeActionIcon } from "@/utils/iconify/action-icons"
import { migrate as projectV121 } from "./migration-scripts/v120-to-v121"

/** Copy supported settings only. Never imports or activates credentials. */
export function toPortableConfig(input: unknown): Config {
  const projected = projectV121(input)
  const providers = projected.providersConfig as unknown[]
  projected.providersConfig = providers.map((provider) => openAIPublicConfigSchema.parse(provider))
  const toolbar = projected.selectionToolbar as { customActions: { icon: string }[] }
  toolbar.customActions = toolbar.customActions.map((action) => ({
    ...action,
    icon: normalizeActionIcon(action.icon),
  }))
  return configSchema.parse(projected)
}
