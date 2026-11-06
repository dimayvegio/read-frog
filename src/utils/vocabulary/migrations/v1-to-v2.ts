// Frozen IndexedDB v1 -> v2 snapshot. Do not import evolving app helpers/types.
export async function migrateVocabularyV1ToV2(transaction: any): Promise<void> {
  const existing = await transaction.table("meta").get("activeNotebookId")
  if (existing && (await transaction.table("notebooks").get(existing.value))) return
  const cards = await transaction.table("cards").toArray()
  if (cards.length === 0) return
  // Legacy ZIP v1 had no collection ID. Replicas sharing the earliest immutable
  // card should migrate to the same ID, even if one has since added more words.
  // Keep the fingerprint and original creation time literal in this snapshot.
  const first = cards.reduce((earliest: any, card: any) =>
    card.createdAt < earliest.createdAt ||
    (card.createdAt === earliest.createdAt && card.id < earliest.id)
      ? card
      : earliest,
  )
  const seed =
    first.id.slice(0, 20) + Math.trunc(first.createdAt).toString(16).padStart(12, "0").slice(-12)
  const bytes = Uint8Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(seed.slice(index * 2, index * 2 + 2), 16),
  )
  bytes[6] = (bytes[6]! & 15) | 64
  bytes[8] = (bytes[8]! & 63) | 128
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  const id = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-")
  const now = Date.now()
  await transaction
    .table("notebooks")
    .put({ id, name: "Sổ 1", nameKey: "sổ 1", createdAt: now, updatedAt: now })
  await transaction.table("meta").put({ key: "activeNotebookId", value: id })
  const progress = await transaction.table("progress").toArray()
  const byId = new Map(progress.map((row: any) => [row.cardId, row]))
  for (const card of cards) {
    await transaction.table("notebookCards").put({ ...card, notebookId: id })
    const old: any = byId.get(card.id)
    await transaction.table("notebookProgress").put({
      notebookId: id,
      cardId: card.id,
      flash: old?.flash ?? { dueAt: 0, intervalDays: 0, reviews: 0, lapses: 0, updatedAt: 0 },
      choice: old?.choice ?? { dueAt: 0, intervalDays: 0, reviews: 0, lapses: 0, updatedAt: 0 },
      type: old?.type ?? { dueAt: 0, intervalDays: 0, reviews: 0, lapses: 0, updatedAt: 0 },
    })
  }
}
