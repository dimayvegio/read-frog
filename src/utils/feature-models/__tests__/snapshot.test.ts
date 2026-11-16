// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { DEFAULT_OPENAI_CONFIG } from "@/types/config/openai"

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})
it("deduplicates initialization and keeps an owned model snapshot until reload", async () => {
  const { storageAdapter } = await import("@/utils/atoms/storage-adapter")
  const read = vi
    .spyOn(storageAdapter, "get")
    .mockResolvedValue({ selectionTranslate: { model: "gpt-4o" } })
  const { loadFeatureModels, getFeatureModel } = await import("../resolver")
  await Promise.all([loadFeatureModels(), loadFeatureModels()])
  expect(read).toHaveBeenCalledOnce()
  read.mockResolvedValue({ selectionTranslate: { model: "gpt-4o-mini" } })
  expect((await getFeatureModel("selectionTranslate"))?.model).toBe("gpt-4o")
  expect(read).toHaveBeenCalledOnce()
})
it("hashes and serializes the same effective per-feature model without changing public config", async () => {
  const { storageAdapter } = await import("@/utils/atoms/storage-adapter")
  vi.spyOn(storageAdapter, "get").mockResolvedValue({
    webTranslate: { model: "gpt-4o" },
    selectionTranslate: { model: "gpt-4o-mini" },
  })
  const { loadFeatureModels } = await import("../resolver")
  const { resolveProviderRefForCapability } = await import("@/utils/providers/provider-registry")
  const { serializeProviderRef, getProviderCacheIdentity } =
    await import("@/utils/providers/provider-ref")
  await loadFeatureModels()
  const source = structuredClone(DEFAULT_OPENAI_CONFIG)
  const web = resolveProviderRefForCapability("pageTranslation", [source], source.id)!
  const selection = resolveProviderRefForCapability("selectionTranslation", [source], source.id)!
  const pdf = resolveProviderRefForCapability("pdfTranslation", [source], source.id)!
  expect(web.config.model.model).toBe("gpt-4o")
  expect(selection.config.model.model).toBe("gpt-4o-mini")
  expect(pdf.config).toEqual(web.config)
  expect(getProviderCacheIdentity(await serializeProviderRef(web))).not.toBe(
    getProviderCacheIdentity(await serializeProviderRef(selection)),
  )
  expect(source).toEqual(DEFAULT_OPENAI_CONFIG)
})
