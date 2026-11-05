import type { Table } from "dexie"
import type { OpenAIKeyStatus } from "@/types/config/openai"
import { Dexie } from "dexie"
import { z } from "zod"

const keySchema = z
  .string()
  .max(8192)
  .refine(
    (key) => !Array.from(key).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127),
  )
  .trim()
  .min(1)
const stateBase = {
  id: z.literal("openai"),
  revision: z.number().int().nonnegative(),
  updatedAt: z.number(),
  legacyImportAllowed: z.boolean(),
}
const credentialSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...stateBase,
    state: z.literal("active"),
    apiKey: keySchema,
    legacyImportAllowed: z.literal(false),
  }),
  z.strictObject({
    ...stateBase,
    state: z.literal("deleted"),
    legacyImportAllowed: z.literal(false),
  }),
  z.strictObject({ ...stateBase, state: z.literal("empty") }),
])
type CredentialState = z.infer<typeof credentialSchema>

export interface BootstrapJournal {
  id: "config-v121"
  sourceVersion: number
  targetVersion: 121
  targetPublicDigest: string
  phase: "prepared" | "config-written" | "metadata-written" | "cleanup-pending" | "complete"
}

const journalSchema = z.strictObject({
  id: z.literal("config-v121"),
  sourceVersion: z.number().int().min(1).max(121),
  targetVersion: z.literal(121),
  targetPublicDigest: z.string().regex(/^[a-f0-9]{64}$/),
  phase: z.enum(["prepared", "config-written", "metadata-written", "cleanup-pending", "complete"]),
})

export interface LegacyCredentialPlan {
  activeKey: string | null
  candidates: unknown[]
}

class CredentialsDB extends Dexie {
  credentialState!: Table<CredentialState, string>
  legacyCandidates!: Table<{ id: number; value: unknown }, number>
  bootstrapJournal!: Table<BootstrapJournal, string>
  migrationRecovery!: Table<{ id: string; value: unknown }, string>

  constructor() {
    // Stable across branding/version changes; intentionally outside AppDB exports.
    super("edge-openai-credentials")
    this.version(1).stores({
      credentialState: "id",
      legacyCandidates: "id",
      bootstrapJournal: "id",
      migrationRecovery: "id",
    })
  }
}

const db = new CredentialsDB()
let opening: Promise<void> | undefined
async function ready() {
  opening ??= new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Credential storage unavailable")), 10000)
    void db
      .open()
      .then(
        () => resolve(),
        () => reject(new Error("Credential storage unavailable")),
      )
      .finally(() => clearTimeout(timer))
  }).catch((error: unknown) => {
    opening = undefined
    throw error
  })
  return opening
}

async function readState() {
  await ready()
  const state = await db.credentialState.get("openai")
  return state ? credentialSchema.parse(state) : undefined
}

/** Background executor only. Never register this function as a message. */
export async function readOpenAIKey(): Promise<string | null> {
  const state = await readState()
  return state?.state === "active" ? state.apiKey : null
}

/** One record read binds connection-test results to the credential actually used. */
export async function readOpenAIExecutionCredential() {
  const state = await readState()
  return { apiKey: state?.state === "active" ? state.apiKey : null, revision: state?.revision ?? 0 }
}

export async function readOpenAIKeyStatus(): Promise<OpenAIKeyStatus> {
  const state = await readState()
  return {
    configured: state?.state === "active",
    revision: state?.revision ?? 0,
    requiresReentry: state?.state !== "active" && (await db.legacyCandidates.count()) > 0,
    recoveryBackupCount: await db.migrationRecovery.count(),
  }
}

async function mutateKey(key: string | null): Promise<OpenAIKeyStatus> {
  const validated = key === null ? null : keySchema.parse(key)
  await ready()
  await db.transaction("rw", db.credentialState, db.legacyCandidates, async () => {
    const old = await readState()
    const common = {
      id: "openai" as const,
      revision: (old?.revision ?? 0) + 1,
      updatedAt: Date.now(),
      legacyImportAllowed: false as const,
    }
    await db.credentialState.put(
      validated === null
        ? { ...common, state: "deleted" }
        : { ...common, state: "active", apiKey: validated },
    )
    await db.legacyCandidates.clear()
  })
  return readOpenAIKeyStatus()
}

export const saveOpenAIKey = (key: string) => mutateKey(key)
export const deleteOpenAIKey = () => mutateKey(null)

export async function readBootstrapJournal() {
  await ready()
  const journal = await db.bootstrapJournal.get("config-v121")
  return journal ? journalSchema.parse(journal) : undefined
}

export async function preserveLegacyCredentialsAndJournal(
  plan: LegacyCredentialPlan,
  journal: BootstrapJournal,
) {
  await ready()
  await db.transaction(
    "rw",
    db.credentialState,
    db.legacyCandidates,
    db.bootstrapJournal,
    async () => {
      const existing = await readState()
      // A user save or deletion always wins, including after an interrupted bootstrap.
      if (!existing || (existing.state === "empty" && existing.legacyImportAllowed)) {
        const key = plan.activeKey === null ? null : keySchema.parse(plan.activeKey)
        const common = {
          id: "openai" as const,
          revision: (existing?.revision ?? 0) + 1,
          updatedAt: Date.now(),
        }
        await db.credentialState.put(
          key
            ? { ...common, state: "active", apiKey: key, legacyImportAllowed: false }
            : { ...common, state: "empty", legacyImportAllowed: true },
        )
        await db.legacyCandidates.clear()
        await db.legacyCandidates.bulkPut(plan.candidates.map((value, id) => ({ id, value })))
      }
      await db.bootstrapJournal.put(journal)
    },
  )
}

export async function advanceBootstrapJournal(journal: BootstrapJournal) {
  await ready()
  await db.transaction("rw", db.credentialState, db.bootstrapJournal, async () => {
    await db.bootstrapJournal.put(journal)
    if (journal.phase === "complete") {
      const state = await readState()
      if (state?.state === "empty")
        await db.credentialState.put({ ...state, legacyImportAllowed: false })
    }
  })
}

export async function preserveRecoveryBackup(id: string, value: unknown) {
  await ready()
  await db.migrationRecovery.put({ id, value })
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function isOfficialOpenAIEndpoint(value: unknown) {
  if (value === undefined || value === "") return true
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
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

/** Inspect installed legacy config only; imports/backups must never call this. */
export function planLegacyCredentials(raw: unknown): LegacyCredentialPlan {
  const config = object(raw)
  const rawProviders = config?.providersConfig
  const rows: Record<string, unknown>[] = Array.isArray(rawProviders)
    ? rawProviders.map(object).filter((row) => row !== null)
    : Object.entries(object(rawProviders) ?? {}).flatMap(([provider, value]) => {
        const row = object(value)
        return row ? [{ ...row, provider, id: row.id ?? provider }] : []
      })
  const candidates = rows.filter(
    (row) =>
      (typeof row.apiKey === "string" && row.apiKey.trim()) ||
      Object.keys(object(row.headers) ?? {}).length > 0,
  )
  const official = candidates.filter(
    (row) =>
      row.provider === "openai" &&
      isOfficialOpenAIEndpoint(row.baseURL) &&
      isOfficialOpenAIEndpoint(row.url) &&
      (row.headers === undefined ||
        (object(row.headers) !== null && Object.keys(object(row.headers)!).length === 0)) &&
      keySchema.safeParse(row.apiKey).success,
  )
  const selectedId =
    object(config?.pageTranslation)?.providerId ??
    object(config?.translate)?.providerId ??
    object(config?.translate)?.provider ??
    config?.provider
  const selected = official.find((row) => row.id === selectedId)
  const keys = [...new Set(official.map((row) => keySchema.parse(row.apiKey)))]
  const activeKey = selected
    ? keySchema.parse(selected.apiKey)
    : keys.length === 1
      ? keys[0]!
      : null
  return {
    activeKey,
    candidates: candidates.filter((row) => !official.includes(row) || row.apiKey !== activeKey),
  }
}
