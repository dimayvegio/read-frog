import { Dexie, type Table } from "dexie"
import {
  DEFAULT_PRICES,
  priceSchema,
  usageEntrySchema,
  estimateUsage,
  type UsageEntry,
  type UsagePrice,
} from "./schema"
export class UsageDatabase extends Dexie {
  entries!: Table<UsageEntry, string>
  prices!: Table<UsagePrice, string>
  meta!: Table<{ key: string; value: number }, string>
  constructor(name = "read-frog-api-usage") {
    super(name)
    this.version(1).stores({ entries: "&id, at, task", prices: "&model", meta: "&key" })
  }
}
export const usageDB = new UsageDatabase()
export async function usageEpoch() {
  return (await usageDB.meta.get("epoch"))?.value ?? 0
}
export async function saveUsage(input: UsageEntry, epoch?: number) {
  const entry = usageEntrySchema.parse(input)
  await usageDB.transaction("rw", usageDB.entries, usageDB.meta, async () => {
    if (epoch !== undefined && epoch !== (await usageEpoch())) return
    await usageDB.entries.put(entry)
    await usageDB.entries
      .where("at")
      .below(Date.now() - 90 * 86400000)
      .delete()
    const excess = (await usageDB.entries.count()) - 20000
    if (excess > 0) await usageDB.entries.orderBy("at").limit(excess).delete()
  })
}
export async function clearUsage() {
  await usageDB.transaction("rw", usageDB.entries, usageDB.meta, async () => {
    await usageDB.meta.put({ key: "epoch", value: (await usageEpoch()) + 1 })
    await usageDB.entries.clear()
  })
}
export async function usageSnapshot() {
  const [entries, customPrices, budget] = await Promise.all([
    usageDB.entries.orderBy("at").reverse().toArray(),
    usageDB.prices.toArray(),
    usageDB.meta.get("monthlyBudget"),
  ])
  const prices = new Map([...DEFAULT_PRICES, ...customPrices].map((price) => [price.model, price]))
  const month = new Date()
  month.setDate(1)
  month.setHours(0, 0, 0, 0)
  const monthly = entries.filter((entry) => entry.at >= month.getTime())
  return {
    entries,
    prices: [...prices.values()],
    budget: budget?.value ?? 0,
    monthlyEstimatedUsd: monthly.reduce(
      (sum, entry) => sum + (estimateUsage(entry, prices.get(entry.model)) ?? 0),
      0,
    ),
    monthlyUnpriced: monthly.filter(
      (entry) => estimateUsage(entry, prices.get(entry.model)) === null,
    ).length,
  }
}
export async function saveUsagePrice(input: UsagePrice) {
  await usageDB.prices.put(priceSchema.parse(input))
}
