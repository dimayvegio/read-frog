import type { ProviderConfig } from "@/types/config/provider"
import { useQuery } from "@tanstack/react-query"
import { Link, useInRouterContext } from "react-router"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
import { buildProviderConfigRoute, openOptionsPage } from "@/utils/navigation"

const LINK_CLASS = "cursor-pointer text-link hover:underline"

/** Stands in for the link while the sentence is translated, then marks where to split it. */
const LINK_SLOT = "\u0000"

/**
 * Renders next to a feature's label when the provider it runs on has no key yet, and nothing
 * otherwise — so callers can hand it whichever provider the feature resolved to.
 *
 * Both destinations open that provider in Provider Config rather than the page as a whole, so
 * the field to fill in is already on screen: the options app navigates in place, and the popup
 * opens the options page in a tab.
 */
export function SetApiKeyWarning({ providerConfig }: { providerConfig: ProviderConfig | null }) {
  const inRouterContext = useInRouterContext()

  const status = useQuery({
    queryKey: ["openai-key-status"],
    queryFn: () => sendMessage("getOpenAIKeyStatus", undefined),
    retry: false,
  })

  if (!providerConfig || !status.data || status.data.configured) {
    return null
  }

  const route = buildProviderConfigRoute(providerConfig.id)
  const label = i18n.t("options.apiProviders.title")
  // One sentence per locale with the link's position marked, rather than a prefix and a suffix
  // the link is sandwiched between — word order around it differs too much per language.
  const [before, after] = i18n
    .t("options.apiProviders.setApiKeyWarning.message", [LINK_SLOT])
    .split(LINK_SLOT)

  return (
    <div className="rounded-md border border-warning/30 bg-warning/10 px-2 text-xs">
      {before}
      {inRouterContext ? (
        <Link to={route} className={LINK_CLASS}>
          {label}
        </Link>
      ) : (
        <button
          type="button"
          className={LINK_CLASS}
          onClick={() => void openOptionsPage({ route })}
        >
          {label}
        </button>
      )}
      {after}
    </div>
  )
}
