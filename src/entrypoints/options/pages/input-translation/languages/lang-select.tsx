import type { LanguageItem } from "@/components/language-combobox-options"
import type { InputTranslationLang } from "@/types/config/config"
import { getTargetLanguageItems } from "@/components/language-combobox-options"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
import { cn } from "@/utils/styles/utils"
import { SELECT_CONTENT_PROPS } from "../../../components/select-content-props"

/**
 * One side of the pair, at the size every other settings select renders at. The caller sizes
 * the trigger — the label it has to hold is a language's name, which the caller knows more
 * about fitting than this does.
 */
export function LangSelect({
  value,
  onValueChange,
  getDisplayLabel,
  className,
}: {
  value: InputTranslationLang
  onValueChange: (value: InputTranslationLang) => void
  getDisplayLabel: (value: InputTranslationLang) => string
  className?: string
}) {
  const languages = getTargetLanguageItems()
  const items: LanguageItem<InputTranslationLang>[] = [
    ...languages.slice(0, 2),
    { value: "targetCode", label: getDisplayLabel("targetCode") },
    { value: "sourceCode", label: getDisplayLabel("sourceCode") },
    ...languages.slice(2),
  ]

  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as InputTranslationLang)}>
      <SelectTrigger size="sm" className={cn("w-full min-w-0", className)}>
        <SelectValue render={<span className="min-w-0 flex-1" />}>
          <span className="block min-w-0 truncate">{getDisplayLabel(value)}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-64" {...SELECT_CONTENT_PROPS}>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
