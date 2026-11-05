import type { FeatureKey } from "@/utils/constants/feature-providers"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { getFeatureLabelI18nKey } from "@/utils/constants/feature-providers"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
import { cn } from "@/utils/styles/utils"

export function LlmFeatureStatusList({
  featureKeys,
  className,
}: {
  featureKeys: readonly FeatureKey[]
  className?: string
}) {
  const status = useQuery({
    queryKey: ["openai-key-status"],
    queryFn: () => sendMessage("getOpenAIKeyStatus", undefined),
    retry: false,
  })
  return (
    <span className={cn("mt-2 flex flex-col gap-1 text-xs", className)}>
      {featureKeys.map((key) => (
        <span key={key}>
          {i18n.t(getFeatureLabelI18nKey(key))}:{" "}
          {status.data?.configured
            ? "OpenAI key saved"
            : status.isError
              ? "Credential storage unavailable"
              : "Configure an OpenAI key"}
        </span>
      ))}
      <Link to="/api-providers" className="underline">
        OpenAI settings
      </Link>
    </span>
  )
}
