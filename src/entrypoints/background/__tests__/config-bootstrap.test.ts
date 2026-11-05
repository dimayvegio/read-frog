import type { BootstrapIO } from "../config-bootstrap"
import type { BootstrapJournal } from "../openai-credentials"
import { describe, expect, it, vi } from "vitest"
import { createConfigBootstrap } from "../config-bootstrap"

type Public = { model: string }
function fixture() {
  let raw: unknown = { model: "old", apiKey: "migration-sentinel" }
  let meta: unknown = { schemaVersion: 120 }
  let journal: BootstrapJournal | undefined
  const validate = (input: unknown): Public => {
    if (
      !input ||
      typeof input !== "object" ||
      !("model" in input) ||
      typeof input.model !== "string"
    )
      throw new Error("invalid")
    return { model: input.model }
  }
  const io: BootstrapIO<Public> = {
    readConfig: vi.fn<BootstrapIO<Public>["readConfig"]>(async () => raw),
    readMeta: vi.fn<BootstrapIO<Public>["readMeta"]>(async () => meta),
    readJournal: vi.fn<BootstrapIO<Public>["readJournal"]>(async () => journal),
    fresh: vi.fn<BootstrapIO<Public>["fresh"]>(async () => ({ model: "default" })),
    project: vi.fn<BootstrapIO<Public>["project"]>(async (value) => validate(value)),
    validate,
    planCredentials: vi.fn<BootstrapIO<Public>["planCredentials"]>(() => ({
      activeKey: "migration-sentinel",
      candidates: [],
    })),
    prepare: vi.fn<BootstrapIO<Public>["prepare"]>(async (_plan, value) => {
      journal = value
    }),
    writeConfig: vi.fn<BootstrapIO<Public>["writeConfig"]>(async (value) => {
      raw = value
    }),
    writeMeta: vi.fn<BootstrapIO<Public>["writeMeta"]>(async (value) => {
      meta = value
    }),
    advance: vi.fn<BootstrapIO<Public>["advance"]>(async (value) => {
      journal = value
    }),
    cleanup: vi.fn<BootstrapIO<Public>["cleanup"]>(async () => {}),
  }
  return {
    io,
    config: () => raw,
    meta: () => meta,
    setRaw: (value: unknown) => {
      raw = value
    },
    setMeta: (value: unknown) => {
      meta = value
    },
  }
}

describe("ordered bootstrap", () => {
  it("prepares credentials before stripping raw public storage", async () => {
    const f = fixture()
    expect(await createConfigBootstrap(f.io).ensure()).toEqual({
      ok: true,
      config: { model: "old" },
      schemaVersion: 121,
    })
    expect(f.io.prepare).toHaveBeenCalledOnce()
    expect(vi.mocked(f.io.prepare).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(f.io.writeConfig).mock.invocationCallOrder[0]!,
    )
    expect(f.config()).toEqual({ model: "old" })
  })
  it.each([0, -1, 1.5, "120", undefined, 122])(
    "does not write invalid/future version %s",
    async (version) => {
      const f = fixture()
      f.setMeta({ schemaVersion: version })
      expect((await createConfigBootstrap(f.io).ensure()).ok).toBe(false)
      expect(f.io.prepare).not.toHaveBeenCalled()
      expect(f.io.writeConfig).not.toHaveBeenCalled()
      expect(f.io.writeMeta).not.toHaveBeenCalled()
    },
  )
  it("only treats absent config AND metadata as fresh", async () => {
    const f = fixture()
    f.setRaw(null)
    expect((await createConfigBootstrap(f.io).ensure()).ok).toBe(false)
    f.setMeta(null)
    expect((await createConfigBootstrap(f.io).ensure()).ok).toBe(true)
    expect(f.io.fresh).toHaveBeenCalledOnce()
  })
  it("does not change public config after a credential transaction failure", async () => {
    const f = fixture()
    vi.mocked(f.io.prepare).mockRejectedValueOnce(new Error("offline"))
    expect(await createConfigBootstrap(f.io).ensure()).toEqual({
      ok: false,
      code: "STORAGE_UNAVAILABLE",
      retryable: true,
    })
    expect(f.config()).toEqual({ model: "old", apiKey: "migration-sentinel" })
    expect(f.meta()).toEqual({ schemaVersion: 120 })
  })
  it("resumes a public checkpoint after a metadata crash without replaying history", async () => {
    const f = fixture()
    vi.mocked(f.io.writeMeta).mockRejectedValueOnce(new Error("crash"))
    expect((await createConfigBootstrap(f.io).ensure()).ok).toBe(false)
    f.setMeta({ schemaVersion: 1 })
    vi.mocked(f.io.project).mockClear()
    expect((await createConfigBootstrap(f.io).ensure()).ok).toBe(true)
    expect(f.io.project).not.toHaveBeenCalled()
  })
  it("does not mistake legacy extra fields for a public checkpoint", async () => {
    const f = fixture()
    vi.mocked(f.io.writeConfig).mockRejectedValueOnce(new Error("crash"))
    expect((await createConfigBootstrap(f.io).ensure()).ok).toBe(false)
    vi.mocked(f.io.project).mockClear()
    expect((await createConfigBootstrap(f.io).ensure()).ok).toBe(true)
    expect(f.io.project).toHaveBeenCalledOnce()
  })
  it("fails closed on projection and cleanup failures", async () => {
    const f = fixture()
    vi.mocked(f.io.project).mockRejectedValueOnce(new Error("invalid"))
    expect(await createConfigBootstrap(f.io).ensure()).toEqual({
      ok: false,
      code: "MIGRATION_FAILED",
      retryable: true,
    })
    expect(f.io.prepare).not.toHaveBeenCalled()
    vi.mocked(f.io.cleanup).mockRejectedValueOnce(new Error("backup failure"))
    expect(await createConfigBootstrap(f.io).ensure()).toEqual({
      ok: false,
      code: "CLEANUP_FAILED",
      retryable: true,
    })
    expect((await createConfigBootstrap(f.io).ensure()).ok).toBe(true)
  })
  it("coalesces attempts and only restarts on explicit retry", async () => {
    const f = fixture()
    vi.mocked(f.io.readConfig).mockRejectedValueOnce(new Error("blocked"))
    const boot = createConfigBootstrap(f.io)
    const a = boot.ensure()
    expect(boot.ensure(true)).toBe(a)
    await a
    expect(boot.ensure()).toBe(a)
    expect((await boot.ensure(true)).ok).toBe(true)
    expect(f.io.readConfig).toHaveBeenCalledTimes(2)
  })
})
