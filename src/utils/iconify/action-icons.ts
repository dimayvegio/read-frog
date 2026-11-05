/** Public custom-action IDs. Shared by validation, picker and prompt authoring. */
export const ACTION_ICON_IDS = [
  "tabler:book-2",
  "tabler:bookmark",
  "tabler:pencil",
  "tabler:sparkles",
  "tabler:language-hiragana",
  "tabler:search",
  "tabler:settings",
  "tabler:bulb",
  "tabler:brain",
  "tabler:star",
  "tabler:heart",
  "tabler:message-circle",
  "tabler:notes",
  "tabler:file-text",
  "tabler:flag",
  "tabler:clock",
  "tabler:calendar",
  "tabler:bolt",
  "tabler:compass",
  "tabler:palette",
  "tabler:feather",
  "tabler:device-laptop",
  "tabler:school",
  "tabler:microscope",
  "tabler:atom-2",
  "tabler:target-arrow",
  "tabler:world",
  "tabler:link",
  "tabler:tags",
  "tabler:wand",
  "tabler:cards",
] as const

const ids: ReadonlySet<string> = new Set(ACTION_ICON_IDS)
const legacyAliases: Readonly<Record<string, string>> = {
  "streamline-color:dictionary-language-book-flat": "tabler:book-2",
  "streamline-color:search-visual-flat": "tabler:search",
  "streamline-color:ai-edit-spark-flat": "tabler:sparkles",
}
export function isActionIcon(id: string): boolean {
  return ids.has(id)
}
export function normalizeActionIcon(id: unknown): string {
  return typeof id === "string"
    ? ids.has(id)
      ? id
      : Object.hasOwn(legacyAliases, id)
        ? legacyAliases[id]!
        : "tabler:sparkles"
    : "tabler:sparkles"
}
