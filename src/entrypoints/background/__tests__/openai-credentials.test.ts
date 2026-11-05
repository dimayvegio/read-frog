import { beforeEach, describe, expect, it, vi } from "vitest"
import "fake-indexeddb/auto"

beforeEach(async () => {
  vi.resetModules()
  const request = indexedDB.deleteDatabase("edge-openai-credentials")
  await new Promise<void>((resolve, reject) => {
    request.onsuccess = () => resolve()
    request.onerror = () => reject(new Error("test database cleanup failed"))
    // Prior tests' Dexie connections close themselves on versionchange.
  })
})

describe("private OpenAI credentials", () => {
  it("reports no secret, increments revisions, and keeps a deletion tombstone", async () => {
    const store = await import("../openai-credentials")
    expect(await store.readOpenAIKeyStatus()).toEqual({
      configured: false,
      revision: 0,
      requiresReentry: false,
      recoveryBackupCount: 0,
    })
    expect(await store.saveOpenAIKey(" sample-credential ")).toEqual({
      configured: true,
      revision: 1,
      requiresReentry: false,
      recoveryBackupCount: 0,
    })
    expect(await store.readOpenAIKey()).toBe("sample-credential")
    expect(await store.deleteOpenAIKey()).toEqual({
      configured: false,
      revision: 2,
      requiresReentry: false,
      recoveryBackupCount: 0,
    })
    expect(await store.readOpenAIKey()).toBeNull()
    await store.preserveLegacyCredentialsAndJournal(
      { activeKey: "old-sentinel", candidates: [{ apiKey: "old-sentinel" }] },
      {
        id: "config-v121",
        sourceVersion: 120,
        targetVersion: 121,
        targetPublicDigest: "public-digest",
        phase: "prepared",
      },
    )
    expect(await store.readOpenAIKey()).toBeNull()
    expect(await store.readOpenAIKeyStatus()).toEqual({
      configured: false,
      revision: 2,
      requiresReentry: false,
      recoveryBackupCount: 0,
    })
  })
  it("preserves a new user key over retry and clears candidate credentials on save/delete", async () => {
    const store = await import("../openai-credentials")
    const journal = {
      id: "config-v121",
      sourceVersion: 120,
      targetVersion: 121,
      targetPublicDigest: "public-digest",
      phase: "prepared",
    } as const
    await store.preserveLegacyCredentialsAndJournal(
      { activeKey: null, candidates: [{ apiKey: "proxy-sentinel" }] },
      journal,
    )
    expect(await store.readOpenAIKeyStatus()).toMatchObject({
      configured: false,
      requiresReentry: true,
    })
    await store.saveOpenAIKey("new-sentinel")
    await store.preserveLegacyCredentialsAndJournal(
      { activeKey: "old-sentinel", candidates: [] },
      journal,
    )
    expect(await store.readOpenAIKey()).toBe("new-sentinel")
    expect(await store.readOpenAIKeyStatus()).toMatchObject({
      configured: true,
      requiresReentry: false,
      recoveryBackupCount: 0,
    })
  })
  it.each(["", "   ", "line\nbreak", "null\u0000byte", "x".repeat(8193)])(
    "rejects invalid key input",
    async (key) => {
      const store = await import("../openai-credentials")
      await expect(store.saveOpenAIKey(key)).rejects.toThrow(/string|characters|Invalid input/)
      expect(await store.readOpenAIKey()).toBeNull()
    },
  )
  it("closes legacy auto import even when first installation has no key", async () => {
    const store = await import("../openai-credentials")
    const journal = {
      id: "config-v121",
      sourceVersion: 121,
      targetVersion: 121,
      targetPublicDigest: "digest",
      phase: "prepared",
    } as const
    await store.preserveLegacyCredentialsAndJournal({ activeKey: null, candidates: [] }, journal)
    await store.advanceBootstrapJournal({ ...journal, phase: "complete" })
    await store.preserveLegacyCredentialsAndJournal(
      { activeKey: "late-sentinel", candidates: [] },
      journal,
    )
    expect(await store.readOpenAIKey()).toBeNull()
  })
  it("selects only an unambiguous official installed credential", async () => {
    const { planLegacyCredentials: plan } = await import("../openai-credentials")
    const row = { id: "a", provider: "openai", apiKey: "official-sentinel" }
    expect(plan({ providersConfig: [row] }).activeKey).toBe("official-sentinel")
    expect(
      plan({ providersConfig: [row, { ...row, id: "b", apiKey: "other-sentinel" }] }).activeKey,
    ).toBeNull()
    expect(
      plan({
        pageTranslation: { providerId: "b" },
        providersConfig: [row, { ...row, id: "b", apiKey: "other-sentinel" }],
      }).activeKey,
    ).toBe("other-sentinel")
    for (const baseURL of [
      "http://api.openai.com/v1",
      "https://api.openai.com.evil/v1",
      "https://user@api.openai.com/v1",
      "https://api.openai.com/v1?x=1",
      "https://proxy.example/v1",
    ]) {
      const result = plan({ providersConfig: [{ ...row, baseURL }] })
      expect(result.activeKey).toBeNull()
      expect(result.candidates).toHaveLength(1)
    }
    expect(
      plan({ providersConfig: [{ ...row, headers: { Authorization: "header-sentinel" } }] })
        .activeKey,
    ).toBeNull()
    expect(plan({ providersConfig: [{ ...row, provider: "google" }] }).activeKey).toBeNull()
    expect(
      plan({ provider: "openai", providersConfig: { openai: { apiKey: "old-map-sentinel" } } })
        .activeKey,
    ).toBe("old-map-sentinel")
    expect(
      plan({ providersConfig: [{ ...row, url: "https://proxy.invalid/v1" }] }).activeKey,
    ).toBeNull()
  })
  it("quarantines header-only credentials and does not discard proxy rows sharing the active key", async () => {
    const store = await import("../openai-credentials")
    const headerOnly = {
      id: "header",
      provider: "openai",
      headers: { Authorization: "header-only-sentinel" },
    }
    const proxy = {
      id: "proxy",
      provider: "openai",
      apiKey: "shared-sentinel",
      baseURL: "https://proxy.invalid/v1",
    }
    const plan = store.planLegacyCredentials({
      providersConfig: [
        { id: "official", provider: "openai", apiKey: "shared-sentinel" },
        headerOnly,
        proxy,
      ],
    })
    expect(plan.activeKey).toBe("shared-sentinel")
    expect(plan.candidates).toEqual([headerOnly, proxy])
    const headerPlan = store.planLegacyCredentials({ providersConfig: [headerOnly] })
    expect(headerPlan.activeKey).toBeNull()
    await store.preserveLegacyCredentialsAndJournal(headerPlan, {
      id: "config-v121",
      sourceVersion: 120,
      targetVersion: 121,
      targetPublicDigest: "a".repeat(64),
      phase: "prepared",
    })
    expect(await store.readOpenAIKeyStatus()).toMatchObject({
      configured: false,
      requiresReentry: true,
    })
    expect(JSON.stringify(await store.readOpenAIKeyStatus())).not.toContain("header-only-sentinel")
    await store.deleteOpenAIKey()
    expect(await store.readOpenAIKeyStatus()).toMatchObject({
      configured: false,
      requiresReentry: false,
    })
  })
})
