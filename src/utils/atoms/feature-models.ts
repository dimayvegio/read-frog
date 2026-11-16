import { atom } from "jotai"
import { z } from "zod"
import { storage } from "#imports"
import {
  featureModelsRecordSchema,
  OPENAI_FEATURE_MODELS_STORAGE_KEY,
  OPENAI_LIVE_MODELS_CACHE_KEY,
  type FeatureModelsRecord,
} from "@/types/feature-models"
import { storageAdapter } from "./storage-adapter"
export const liveModelsSchema = z
  .array(
    z
      .string()
      .max(128)
      .regex(/^[a-z0-9][a-z0-9:._-]*$/iu),
  )
  .max(1000)
export const baseFeatureModelsAtom = atom<FeatureModelsRecord>({})
let queue = Promise.resolve()
let version = 0
export const featureModelsAtom = atom(
  (get) => get(baseFeatureModelsAtom),
  async (_get, set, update: (current: FeatureModelsRecord) => FeatureModelsRecord) => {
    const own = ++version
    const job = queue.then(async () => {
      const current = await storageAdapter.get(
        OPENAI_FEATURE_MODELS_STORAGE_KEY,
        {},
        featureModelsRecordSchema,
      )
      const next = featureModelsRecordSchema.parse(update(current))
      await storageAdapter.set(OPENAI_FEATURE_MODELS_STORAGE_KEY, next, featureModelsRecordSchema)
      if (own === version) set(baseFeatureModelsAtom, next)
    })
    queue = job.catch(() => {})
    return job
  },
)
baseFeatureModelsAtom.onMount = (set) => {
  let active = true,
    generation = 0
  const refresh = async () => {
    const own = ++generation
    await queue
    const v = version
    try {
      const value = await storageAdapter.get(
        OPENAI_FEATURE_MODELS_STORAGE_KEY,
        {},
        featureModelsRecordSchema,
      )
      if (active && own === generation && v === version) set(value)
    } catch {
      /* Retain the last validated UI snapshot. */
    }
  }
  const unwatch = storage.watch(`local:${OPENAI_FEATURE_MODELS_STORAGE_KEY}`, () => {
    void refresh()
  })
  void refresh()
  return () => {
    active = false
    unwatch()
  }
}
const baseLiveModelsAtom = atom<string[]>([])
export const liveModelsAtom = atom(
  (get) => get(baseLiveModelsAtom),
  async (_get, set, value: string[]) => {
    const next = liveModelsSchema.parse(value)
    await storageAdapter.set(OPENAI_LIVE_MODELS_CACHE_KEY, next, liveModelsSchema)
    set(baseLiveModelsAtom, next)
  },
)
baseLiveModelsAtom.onMount = (set) => {
  let active = true
  void storageAdapter
    .get(OPENAI_LIVE_MODELS_CACHE_KEY, [], liveModelsSchema)
    .then((value) => {
      if (active) set(value)
    })
    .catch(() => {})
  return () => {
    active = false
  }
}
