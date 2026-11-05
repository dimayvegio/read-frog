/** Frozen v121 projection. No storage, credentials, network or evolving defaults. */
type ObjectValue = Record<string, unknown>
const PROVIDER_ID = "openai-default"
const ACTION_ICONS: string[] = [
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
]
const ICON_ALIASES: Record<string, string> = {
  "streamline-color:dictionary-language-book-flat": "tabler:book-2",
  "streamline-color:search-visual-flat": "tabler:search",
  "streamline-color:ai-edit-spark-flat": "tabler:sparkles",
}
const MODELS = [
  "gpt-6-luna",
  "gpt-6.1-sol",
  "gpt-6.1-terra",
  "gpt-6-sol",
  "gpt-6-astra",
  "gpt-5.6-luna",
  "gpt-5.6-terra",
  "gpt-5.6-sol",
  "gpt-5.6",
  "gpt-5.5",
  "gpt-5.4-pro",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.3-chat-latest",
  "gpt-5.2-pro",
  "gpt-5.2-chat-latest",
  "gpt-5.2",
  "gpt-5.1-codex-mini",
  "gpt-5.1-codex",
  "gpt-5.1-chat-latest",
  "gpt-5.1",
  "gpt-5-pro",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5-codex",
  "gpt-5-chat-latest",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o",
  "gpt-4o-mini",
]
const REASONING = ["provider-default", "none", "minimal", "low", "medium", "high", "xhigh"]

function object(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid v120 configuration")
  return value as ObjectValue
}
function pick(input: ObjectValue, keys: string[]) {
  return Object.fromEntries(
    keys.filter((key) => Object.hasOwn(input, key)).map((key) => [key, input[key]]),
  )
}
function official(row: ObjectValue) {
  if (row.provider !== "openai") return false
  if (row.baseURL === undefined || row.baseURL === "") return true
  if (typeof row.baseURL !== "string") return false
  try {
    const url = new URL(row.baseURL)
    return (
      url.origin === "https://api.openai.com" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/v1\/?$/.test(url.pathname)
    )
  } catch {
    return false
  }
}
function provider(row: ObjectValue | undefined) {
  const base = {
    id: PROVIDER_ID,
    provider: "openai",
    name: "OpenAI",
    enabled: true,
    model: { model: "gpt-6-luna", isCustomModel: false, customModel: null as string | null },
  }
  if (!row) return base
  if (!row.model || typeof row.model !== "object" || Array.isArray(row.model)) return base
  const model = object(row.model)
  if (
    typeof model.isCustomModel !== "boolean" ||
    (model.isCustomModel
      ? typeof model.customModel !== "string" || !model.customModel.trim()
      : !MODELS.includes(model.model as string))
  )
    return base
  return {
    ...base,
    model: {
      model: MODELS.includes(model.model as string) ? model.model : "gpt-6-luna",
      isCustomModel: model.isCustomModel,
      customModel:
        typeof model.customModel === "string" && model.customModel.trim()
          ? model.customModel.trim()
          : null,
    },
    ...(typeof row.temperature === "number" && row.temperature >= 0 && row.temperature <= 2
      ? { temperature: row.temperature }
      : {}),
    ...(typeof row.reasoning === "string" && REASONING.includes(row.reasoning)
      ? { reasoning: row.reasoning }
      : {}),
  }
}

export function migrate(input: unknown): ObjectValue {
  const old = object(input)
  if (!Array.isArray(old.providersConfig)) throw new Error("Missing legacy providers")
  const rows = old.providersConfig.map(object).filter(official)
  const selected = rows.find((row) => row.id === object(old.pageTranslation).providerId)
  const chosen = selected ?? (rows.length === 1 ? rows[0] : undefined)
  const toolbar = object(old.selectionToolbar)
  const features = object(toolbar.features)
  const builtIns = object(toolbar.builtInActions)
  const builtInActions = Object.fromEntries(
    Object.entries(builtIns).map(([id, value]) => [
      id,
      { ...pick(object(value), ["enabled", "shortcut"]), providerId: PROVIDER_ID },
    ]),
  )
  if (!Array.isArray(toolbar.customActions)) throw new Error("Missing custom actions")
  const customActions = toolbar.customActions.map((value) => ({
    ...pick(object(value), [
      "id",
      "name",
      "enabled",
      "icon",
      "systemPrompt",
      "prompt",
      "outputSchema",
      "shortcut",
      "layout",
      "sampleData",
    ]),
    icon:
      typeof object(value).icon === "string" && ACTION_ICONS.includes(object(value).icon as string)
        ? object(value).icon
        : Object.hasOwn(ICON_ALIASES, String(object(value).icon))
          ? ICON_ALIASES[String(object(value).icon)]
          : "tabler:sparkles",
    providerId: PROVIDER_ID,
  }))
  const retainedIds = new Set([
    "translate",
    "speak",
    "default-dictionary",
    "default-sentence-analysis",
    "default-improve-writing",
    ...toolbar.customActions.map((action) => object(action).id),
  ])
  const list = (value: unknown) =>
    Array.isArray(value) ? value.filter((id) => retainedIds.has(id as string)) : []
  return {
    ...pick(old, [
      "language",
      "tts",
      "floatingButton",
      "sideContent",
      "betaExperience",
      "contextMenu",
      "siteControl",
      "siteRules",
      "uiLanguage",
      "glossary",
    ]),
    providersConfig: [provider(chosen)],
    pageTranslation: { ...object(old.pageTranslation), providerId: PROVIDER_ID },
    inputTranslation: { ...object(old.inputTranslation), providerId: PROVIDER_ID },
    languageDetection: {
      ...object(old.languageDetection),
      ...(object(old.languageDetection).providerId !== undefined ||
      object(old.languageDetection).mode === "llm"
        ? { providerId: PROVIDER_ID }
        : {}),
    },
    videoSubtitles: { ...object(old.videoSubtitles), providerId: PROVIDER_ID },
    translationHub: { ...object(old.translationHub), selectedProviderIds: [PROVIDER_ID] },
    selectionToolbar: {
      ...pick(toolbar, ["enabled", "disabledSelectionToolbarPatterns", "opacity", "annotation"]),
      features: {
        translate: { ...object(features.translate), providerId: PROVIDER_ID },
        speak: features.speak,
      },
      builtInActions,
      customActions,
      order: list(toolbar.order),
      unpinned: list(toolbar.unpinned),
    },
  }
}
