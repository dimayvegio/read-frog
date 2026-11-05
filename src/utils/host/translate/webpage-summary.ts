import type { CachedWebPageContext } from "./webpage-context"
import type { PromptableProviderRef } from "@/utils/providers/provider-ref"
import { sendMessage } from "@/utils/message"

/**
 * `hostedFeature` is the route of the feature that triggered the summary: the
 * summary is a sub-call of that feature and bills against its quota, so the
 * caller that gated `providerRef` must name the same route here.
 */
export async function getOrGenerateWebPageSummary(
  webPageContext: CachedWebPageContext | null,
  providerRef: PromptableProviderRef,
  enableAIContentAware: boolean,
  _feature?: string,
): Promise<string | null> {
  if (!enableAIContentAware || !webPageContext) {
    return null
  }

  const { webTitle, webContent } = webPageContext
  if (!webTitle.trim() || !webContent.trim()) {
    return null
  }

  try {
    const summary = await sendMessage("getOrGenerateWebPageSummary", {
      webTitle,
      webContent,
      providerRef,
    })
    return summary || null
  } catch {
    // Smart context is optional; retain the original page text when it is unavailable.
    return null
  }
}
