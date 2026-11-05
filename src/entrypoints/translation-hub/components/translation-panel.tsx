import { useAtomValue, useSetAtom } from "jotai"
import { selectedProviderIdsAtom, translationCardExpandedStateAtom } from "../atoms"
import { TranslationCard } from "./translation-card"

export function TranslationPanel() {
  const selectedProviderIds = useAtomValue(selectedProviderIdsAtom)
  const expandedById = useAtomValue(translationCardExpandedStateAtom)
  const setExpandedById = useSetAtom(translationCardExpandedStateAtom)

  return (
    <div className="space-y-4">
      {selectedProviderIds.map((id) => (
        <TranslationCard
          key={id}
          providerId={id}
          isExpanded={expandedById[id] ?? true}
          onExpandedChange={(expanded) => {
            setExpandedById((prev) => ({ ...prev, [id]: expanded }))
          }}
        />
      ))}
    </div>
  )
}
