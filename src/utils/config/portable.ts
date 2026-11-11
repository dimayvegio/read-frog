import type { Config } from "@/types/config/config"
import { configSchema } from "@/types/config/config"
import { openAIPublicConfigSchema } from "@/types/config/openai"
import { normalizeActionIcon } from "@/utils/iconify/action-icons"
import { migrate as projectV121 } from "./migration-scripts/v120-to-v121"
import { migrate as projectV122 } from "./migration-scripts/v121-to-v122"
import { migrate as projectV123 } from "./migration-scripts/v122-to-v123"
import { migrate as projectV124 } from "./migration-scripts/v123-to-v124"
import { migrate as projectV125 } from "./migration-scripts/v124-to-v125"

/** Copy supported settings only. Never imports or activates credentials. */
export function toPortableConfig(input: unknown): Config {
  const projected = projectV125(projectV124(projectV123(projectV122(projectV121(input)))))
  const providers = projected.providersConfig as unknown[]
  projected.providersConfig = providers.map((provider) => openAIPublicConfigSchema.parse(provider))
  const toolbar = projected.selectionToolbar as { customActions: { icon: string }[] }
  toolbar.customActions = toolbar.customActions.map((action) => ({
    ...action,
    icon: normalizeActionIcon(action.icon),
  }))
  return configSchema.parse(projected)
}
