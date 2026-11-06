import type {
  AudioAsset,
  CardProgress,
  VocabularyBundle,
  VocabularyCard,
  ReviewMode,
  Grade,
} from "./schema"
import { Dexie, type Table } from "dexie"
import {
  emptyProgress,
  mergeProgress,
  scheduleReview,
  MAX_CARDS,
  MAX_ARCHIVE_BYTES,
} from "./schema"

class VocabularyDatabase extends Dexie {
  cards!: Table<VocabularyCard, string>
  audio!: Table<AudioAsset, string>
  progress!: Table<CardProgress, string>
  constructor(name = "read-frog-vocabulary") {
    super(name)
    this.version(1).stores({
      cards: "&id, captureKey, updatedAt",
      audio: "&id",
      progress: "&cardId",
    })
  }
}
export const vocabularyDB = new VocabularyDatabase()

export async function loadLibrary() {
  const [cards, progress] = await Promise.all([
    vocabularyDB.cards.toArray(),
    vocabularyDB.progress.toArray(),
  ])
  return { cards: cards.sort((a, b) => b.createdAt - a.createdAt), progress }
}
export async function importLibrary(bundle: VocabularyBundle) {
  await vocabularyDB.transaction(
    "rw",
    vocabularyDB.cards,
    vocabularyDB.audio,
    vocabularyDB.progress,
    async () => {
      const existing = new Set(await vocabularyDB.cards.toCollection().primaryKeys())
      if (new Set([...existing, ...bundle.cards.map((c) => c.id)]).size > MAX_CARDS)
        throw new Error(`Tối đa ${MAX_CARDS} từ trong một thư viện. Hãy xuất bộ hiện tại trước.`)
      const sizes = new Map((await vocabularyDB.audio.toArray()).map((a) => [a.id, a.bytes.length]))
      for (const asset of bundle.audio) sizes.set(asset.id, asset.bytes.length)
      if ([...sizes.values()].reduce((a, b) => a + b, 0) > MAX_ARCHIVE_BYTES - 4 * 1024 * 1024)
        throw new Error("Bộ từ đã gần 64 MB. Xuất bộ cũ và tạo bộ mới trước khi nhập thêm.")
      for (const asset of bundle.audio) await vocabularyDB.audio.put(asset)
      for (const card of bundle.cards) {
        const old = await vocabularyDB.cards.get(card.id)
        if (!old || card.updatedAt > old.updatedAt) await vocabularyDB.cards.put(card)
      }
      for (const incoming of bundle.progress)
        await vocabularyDB.progress.put(
          mergeProgress(await vocabularyDB.progress.get(incoming.cardId), incoming),
        )
    },
  )
}
export async function saveGeneratedCard(
  card: VocabularyCard,
  audio: AudioAsset[],
  signal?: AbortSignal,
) {
  // Content and both clips become visible together, never a half-generated card.
  await vocabularyDB.transaction(
    "rw",
    vocabularyDB.cards,
    vocabularyDB.audio,
    vocabularyDB.progress,
    async () => {
      signal?.throwIfAborted()
      if (await vocabularyDB.cards.get(card.id)) return
      if ((await vocabularyDB.cards.count()) >= MAX_CARDS)
        throw new Error("Thư viện đã đầy. Hãy xuất và tạo bộ mới.")
      const size =
        (await vocabularyDB.audio.toArray()).reduce((n, a) => n + a.bytes.length, 0) +
        audio.reduce((n, a) => n + a.bytes.length, 0)
      if (size > MAX_ARCHIVE_BYTES - 4 * 1024 * 1024)
        throw new Error("Bộ từ đã gần 64 MB. Hãy xuất và tạo bộ mới.")
      await vocabularyDB.audio.bulkPut(audio)
      signal?.throwIfAborted()
      await vocabularyDB.cards.add(card)
      await vocabularyDB.progress.put(emptyProgress(card.id))
      signal?.throwIfAborted()
    },
  )
}
export async function exportLibrary(): Promise<VocabularyBundle> {
  return vocabularyDB.transaction(
    "r",
    vocabularyDB.cards,
    vocabularyDB.audio,
    vocabularyDB.progress,
    async () => ({
      cards: await vocabularyDB.cards.toArray(),
      audio: await vocabularyDB.audio.toArray(),
      progress: await vocabularyDB.progress.toArray(),
    }),
  )
}
export async function reviewCard(cardId: string, mode: ReviewMode, grade: Grade) {
  return vocabularyDB.transaction("rw", vocabularyDB.cards, vocabularyDB.progress, async () => {
    if (!(await vocabularyDB.cards.get(cardId)))
      throw new Error("Từ này đã được xóa ở cửa sổ khác.")
    const progress = (await vocabularyDB.progress.get(cardId)) ?? emptyProgress(cardId)
    progress[mode] = scheduleReview(progress[mode], grade)
    await vocabularyDB.progress.put(progress)
    return progress
  })
}
export async function deleteVocabularyCard(cardId: string) {
  await vocabularyDB.transaction(
    "rw",
    vocabularyDB.cards,
    vocabularyDB.progress,
    vocabularyDB.audio,
    async () => {
      await vocabularyDB.cards.delete(cardId)
      await vocabularyDB.progress.delete(cardId)
      const used = new Set(
        (await vocabularyDB.cards.toArray()).flatMap((c) => [c.audio.word, c.audio.example]),
      )
      await vocabularyDB.audio.bulkDelete(
        (await vocabularyDB.audio.toCollection().primaryKeys()).filter((id) => !used.has(id)),
      )
    },
  )
}
export async function clearVocabularyLibrary() {
  await vocabularyDB.transaction(
    "rw",
    vocabularyDB.cards,
    vocabularyDB.audio,
    vocabularyDB.progress,
    async () => {
      await vocabularyDB.cards.clear()
      await vocabularyDB.audio.clear()
      await vocabularyDB.progress.clear()
    },
  )
}
