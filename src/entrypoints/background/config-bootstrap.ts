import type { BootstrapJournal, LegacyCredentialPlan } from "./openai-credentials"
import type { InitialConfigResult } from "@/types/config/openai"
import { sha256 } from "js-sha256"

function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJSON(record[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

export interface BootstrapIO<T> {
  readConfig: () => Promise<unknown>
  readMeta: () => Promise<unknown>
  readJournal: () => Promise<BootstrapJournal | undefined>
  fresh: () => Promise<T>
  project: (raw: unknown, version: number) => Promise<T>
  validate: (raw: unknown) => T
  planCredentials: (raw: unknown) => LegacyCredentialPlan
  prepare: (plan: LegacyCredentialPlan, journal: BootstrapJournal) => Promise<void>
  writeConfig: (config: T) => Promise<void>
  writeMeta: (meta: { schemaVersion: number; lastModifiedAt: number }) => Promise<void>
  advance: (journal: BootstrapJournal) => Promise<void>
  cleanup: () => Promise<void>
}

/** Shared attempt; only the trusted settings handler is allowed to request retry. */
export function createConfigBootstrap<T>(io: BootstrapIO<T>, latestVersion: 121 | 122 = 121) {
  let attempt: Promise<InitialConfigResult<T>> | undefined
  let running = false
  let result: InitialConfigResult<T> | undefined

  async function run(): Promise<InitialConfigResult<T>> {
    let phase: "read" | "plan" | "commit" | "cleanup" = "read"
    try {
      const [raw, metadata, previousJournal] = await Promise.all([
        io.readConfig(),
        io.readMeta(),
        io.readJournal(),
      ])
      const meta =
        metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : undefined
      const version = meta?.schemaVersion
      if (typeof version === "number" && version > latestVersion)
        return { ok: false, code: "UNSUPPORTED_SCHEMA", retryable: false }
      const rawAbsent = raw === null || raw === undefined
      const fresh =
        rawAbsent && (metadata === null || metadata === undefined) && previousJournal === undefined
      let checkpoint: T | undefined
      // Check the physical shape BEFORE digest comparison. Projection could hide legacy secrets.
      if (!rawAbsent && previousJournal) {
        try {
          const publicValue = io.validate(raw)
          if (
            canonicalJSON(raw) === canonicalJSON(publicValue) &&
            sha256(canonicalJSON(publicValue)) === previousJournal.targetPublicDigest
          )
            checkpoint = publicValue
        } catch {
          /* Legacy shape: continue planning, never treat it as a checkpoint. */
        }
      }
      if (
        !fresh &&
        !checkpoint &&
        (rawAbsent ||
          !Number.isInteger(version) ||
          (version as number) < 1 ||
          (version as number) > latestVersion)
      ) {
        return { ok: false, code: "MIGRATION_FAILED", retryable: false }
      }
      phase = "plan"
      // Historical steps may mutate their input. Inspect installed secrets first,
      // while still deferring every write until projection and validation succeed.
      const credentialPlan = checkpoint
        ? { activeKey: null, candidates: [] }
        : io.planCredentials(raw)
      const config =
        checkpoint ?? (fresh ? await io.fresh() : await io.project(raw, version as number))
      const target = io.validate(config)
      const journal: BootstrapJournal = {
        id: "config-v121",
        sourceVersion: checkpoint
          ? previousJournal!.sourceVersion
          : fresh
            ? latestVersion
            : (version as number),
        targetVersion: latestVersion,
        targetPublicDigest: sha256(canonicalJSON(target)),
        phase: "prepared",
      }
      phase = "commit"
      if (!checkpoint) await io.prepare(credentialPlan, journal)
      if (canonicalJSON(raw) !== canonicalJSON(target)) await io.writeConfig(target)
      await io.advance({ ...journal, phase: "config-written" })
      await io.writeMeta({
        schemaVersion: latestVersion,
        lastModifiedAt: typeof meta?.lastModifiedAt === "number" ? meta.lastModifiedAt : Date.now(),
      })
      await io.advance({ ...journal, phase: "metadata-written" })
      phase = "cleanup"
      await io.advance({ ...journal, phase: "cleanup-pending" })
      await io.cleanup()
      await io.advance({ ...journal, phase: "complete" })
      return { ok: true, config: target, schemaVersion: latestVersion }
    } catch {
      return {
        ok: false,
        code:
          phase === "cleanup"
            ? "CLEANUP_FAILED"
            : phase === "plan"
              ? "MIGRATION_FAILED"
              : "STORAGE_UNAVAILABLE",
        retryable: true,
      }
    }
  }

  return {
    ensure(retry = false): Promise<InitialConfigResult<T>> {
      if (!attempt || (retry && !running && result?.ok === false && result.retryable)) {
        running = true
        attempt = run()
          .then((value) => {
            result = value
            return value
          })
          .finally(() => {
            running = false
          })
      }
      return attempt
    },
  }
}
