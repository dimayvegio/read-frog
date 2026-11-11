import { afterEach, describe, expect, it, vi } from "vitest"
// Warm config's module graph at collection time, which has no timeout. Each test
// still re-imports it after vi.resetModules(), but no longer pays the cold load
// inside its 5s budget.
import "../config"

describe("dEFAULT_CONFIG", () => {
  const originalCrypto = globalThis.crypto

  afterEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    })
    vi.resetModules()
  })

  it("initializes when crypto.randomUUID is unavailable but crypto.getRandomValues exists", async () => {
    const getRandomValues = vi.fn<(...args: any[]) => any>((array: Uint8Array<ArrayBuffer>) =>
      originalCrypto.getRandomValues(array),
    )

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues,
      },
    })
    vi.resetModules()

    const { createDefaultDictionaryAction, createDefaultSentenceAnalysisAction, DEFAULT_CONFIG } =
      await import("../config")
    const defaultDictionaryAction = createDefaultDictionaryAction()
    const defaultSentenceAnalysisAction = createDefaultSentenceAnalysisAction()

    expect(defaultDictionaryAction).toEqual(
      expect.objectContaining({
        id: "default-dictionary",
        icon: "tabler:book-2",
      }),
    )
    expect(defaultSentenceAnalysisAction).toEqual(
      expect.objectContaining({
        id: "default-sentence-analysis",
        icon: "tabler:search",
      }),
    )
    expect(defaultDictionaryAction?.outputSchema).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "default-dictionary-term" })]),
    )
    expect(
      defaultDictionaryAction?.outputSchema.every(
        (field) => typeof field.id === "string" && field.id.length > 0,
      ),
    ).toBe(true)
    expect(DEFAULT_CONFIG.selectionToolbar.customActions).toEqual([])
  })

  it("defaults fresh hover translation off", async () => {
    const { DEFAULT_CONFIG } = await import("../config")

    expect(DEFAULT_CONFIG.pageTranslation.node.forceRetranslation).toBe(false)
  })

  it("keeps pre-v090 config parseable until the background migration runs", async () => {
    const { DEFAULT_CONFIG } = await import("../config")
    const { configSchema } = await import("@/types/config/config")
    const legacyConfig = structuredClone(DEFAULT_CONFIG)
    const legacyNode = legacyConfig.pageTranslation.node as Partial<
      typeof legacyConfig.pageTranslation.node
    >

    delete legacyNode.forceRetranslation
    legacyConfig.language.targetCode = "ja"

    const result = configSchema.safeParse(legacyConfig)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.pageTranslation.node.forceRetranslation).toBe(false)
    expect(result.data.language.targetCode).toBe("ja")
  })

  it("rebuilds schema-valid built-in action state for persistence", async () => {
    const { buildFreshDefaultConfig, createDefaultDictionaryAction, DEFAULT_CONFIG } =
      await import("../config")
    const { configSchema } = await import("@/types/config/config")

    const config = buildFreshDefaultConfig()

    expect(config).not.toBe(DEFAULT_CONFIG)
    expect(config.selectionToolbar.customActions).not.toBe(
      DEFAULT_CONFIG.selectionToolbar.customActions,
    )
    expect(config.selectionToolbar.builtInActions.dictionary).toEqual({
      enabled: true,
      providerId: "openai-default",
    })
    expect(config.selectionToolbar.customActions).toEqual([])
    expect(createDefaultDictionaryAction()).toEqual(
      expect.objectContaining({
        id: "default-dictionary",
        name: expect.any(String),
        systemPrompt: expect.any(String),
        prompt: expect.any(String),
      }),
    )
    expect(configSchema.safeParse(config).success).toBe(true)
  })
})

describe("createDefaultDictionaryAction layout", () => {
  it("is the dictionary card built for the renamed field ids", async () => {
    const { createDefaultDictionaryAction } = await import("../config")
    const { buildDictionaryActionLayout } = await import("@/utils/layout-host/slots")

    const action = createDefaultDictionaryAction()

    expect(action?.layout).toEqual(expect.any(String))
    expect(action?.layout).toBe(buildDictionaryActionLayout(action?.outputSchema ?? []))
    expect(action?.layout).toContain("default-dictionary-term")
  })

  it("places every field exactly once, leaving the card's tail empty", async () => {
    const { createDefaultDictionaryAction } = await import("../config")
    const { compileLayout, renderLayoutHtml } = await import("@read-frog/layout-engine/core")
    const { buildCustomActionLayoutScope } = await import("@/utils/layout-host/host")
    const { getDictionarySlots } = await import("@/utils/layout-host/slots")

    const action = createDefaultDictionaryAction()
    if (!action?.layout) throw new Error("expected the built-in Dictionary to carry a layout")
    const compiled = compileLayout(action.layout)
    if (!compiled.ok) throw compiled.error

    const value: Record<string, string> = Object.fromEntries(
      action.outputSchema.map((field, index) => [field.name, `value ${index}`]),
    )
    // The term's quotes are not shown as text: they mark the sentence.
    const slots = getDictionarySlots(action.outputSchema)
    const sentence = value[slots.context?.name ?? ""]
    const termName = slots.contextTerm?.name ?? ""
    value[termName] = JSON.stringify([{ text: sentence }])
    const html = renderLayoutHtml(
      compiled.compiled,
      buildCustomActionLayoutScope({
        outputSchema: action.outputSchema,
        value,
        selection: "blossom",
        targetCode: "zh-Hans",
        status: "done",
      }),
    )
    // Text between tags: the headword is also in its button's data-speak,
    // which is an attribute and not counted.
    const textRuns = html.split(/<[^>]*>/).map((run) => run.trim())

    expect(action.outputSchema).toHaveLength(9)
    for (const [name, shown] of Object.entries(value)) {
      if (name === termName) continue
      expect(textRuns.filter((run) => run === shown)).toHaveLength(1)
    }
    expect(html).toContain(`<b class="rf-d-mark">${sentence}</b>`)
    expect(html).not.toContain('class="rf-field"')
  })
})
