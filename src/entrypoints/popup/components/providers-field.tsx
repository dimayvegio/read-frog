import { useAtomValue } from "jotai"
import ProviderSelector from "@/components/llm-providers/provider-selector"
import { configFieldsAtomMap } from "@/utils/atoms/config"

export default function ProvidersField() {
  const providers = useAtomValue(configFieldsAtomMap.providersConfig)
  return (
    <div className="flex items-center justify-between">
      <span>Text translation</span>
      <ProviderSelector providers={providers} value="openai-default" />
    </div>
  )
}
