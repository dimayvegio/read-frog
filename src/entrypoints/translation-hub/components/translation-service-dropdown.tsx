import { useAtomValue } from "jotai"
import ProviderSelector from "@/components/llm-providers/provider-selector"
import { configFieldsAtomMap } from "@/utils/atoms/config"
export function TranslationServiceDropdown() {
  const providers = useAtomValue(configFieldsAtomMap.providersConfig)
  return <ProviderSelector providers={providers} value="openai-default" />
}
