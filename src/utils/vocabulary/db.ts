import { Dexie, type Table } from "dexie"
import { getRandomUUID } from "../crypto-polyfill"
import { migrateVocabularyV1ToV2 } from "./migrations/v1-to-v2"
import {
  emptyProgress,
  mergeProgress,
  scheduleReview,
  notebookSchema,
  normalizeAnswer,
  MAX_CARDS,
  MAX_ARCHIVE_BYTES,
  type AudioAsset,
  type CardProgress,
  type VocabularyBundle,
  type VocabularyCard,
  type ReviewMode,
  type Grade,
  type VocabularyNotebook,
  type NotebookSnapshot,
} from "./schema"

interface StoredNotebook extends VocabularyNotebook {
  nameKey: string
}
interface StoredCard extends VocabularyCard {
  notebookId: string
}
interface StoredProgress extends CardProgress {
  notebookId: string
}
export class VocabularyDatabase extends Dexie {
  // Published v1 stores stay intact. New code uses compound-keyed v2 stores.
  cards!: Table<VocabularyCard, string>
  audio!: Table<AudioAsset, string>
  progress!: Table<CardProgress, string>
  notebooks!: Table<StoredNotebook, string>
  notebookCards!: Table<StoredCard, [string, string]>
  notebookProgress!: Table<StoredProgress, [string, string]>
  meta!: Table<{ key: string; value: string }, string>
  constructor(name = "read-frog-vocabulary") {
    super(name)
    this.version(1).stores({
      cards: "&id, captureKey, updatedAt",
      audio: "&id",
      progress: "&cardId",
    })
    this.version(2)
      .stores({
        notebooks: "&id, &nameKey, createdAt",
        notebookCards: "&[notebookId+id], notebookId, id, captureKey",
        notebookProgress: "&[notebookId+cardId], notebookId",
        meta: "&key",
      })
      .upgrade(migrateVocabularyV1ToV2)
  }
}
export const vocabularyDB = new VocabularyDatabase()
const publicNotebook = (row: StoredNotebook): VocabularyNotebook => ({
  id: row.id,
  name: row.name,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})
function publicCard(row: StoredCard): VocabularyCard {
  const { notebookId: _notebookId, ...card } = row
  return card
}
function publicProgress(row: StoredProgress): CardProgress {
  const { notebookId: _notebookId, ...progress } = row
  return progress
}
const tables = () => [
  vocabularyDB.notebooks,
  vocabularyDB.notebookCards,
  vocabularyDB.notebookProgress,
  vocabularyDB.audio,
  vocabularyDB.meta,
]
async function requireNotebook(id: string) {
  const notebook = await vocabularyDB.notebooks.get(id)
  if (!notebook) throw new Error("Sổ đã bị xóa hoặc không còn tồn tại.")
  return notebook
}
async function uniqueName(name: string, exceptId?: string) {
  const parsed = notebookSchema.shape.name.parse(name)
  const existing = await vocabularyDB.notebooks
    .where("nameKey")
    .equals(normalizeAnswer(parsed))
    .first()
  if (existing && existing.id !== exceptId) throw new Error("Tên sổ này đã có. Hãy chọn tên khác.")
  return parsed
}
async function chooseImportedName(name: string, exceptId: string) {
  let candidate = name
  for (let suffix = 2; ; suffix++) {
    const existing = await vocabularyDB.notebooks
      .where("nameKey")
      .equals(normalizeAnswer(candidate))
      .first()
    if (!existing || existing.id === exceptId) return candidate
    candidate = `${name.slice(0, 65)} (${suffix})`
  }
}
export async function getNotebookSnapshot(): Promise<NotebookSnapshot> {
  const notebooks = (await vocabularyDB.notebooks.orderBy("createdAt").toArray()).map(
    publicNotebook,
  )
  const active = (await vocabularyDB.meta.get("activeNotebookId"))?.value
  return {
    notebooks,
    activeNotebookId: notebooks.find((n) => n.id === active)?.id ?? notebooks[0]?.id ?? null,
  }
}
export async function createNotebook(name: string): Promise<VocabularyNotebook> {
  return vocabularyDB.transaction("rw", vocabularyDB.notebooks, vocabularyDB.meta, async () => {
    const finalName = await uniqueName(name),
      now = Date.now()
    const notebook = { id: getRandomUUID(), name: finalName, createdAt: now, updatedAt: now }
    await vocabularyDB.notebooks.add({ ...notebook, nameKey: normalizeAnswer(finalName) })
    await vocabularyDB.meta.put({ key: "activeNotebookId", value: notebook.id })
    return notebook
  })
}
export async function renameNotebook(id: string, name: string) {
  return vocabularyDB.transaction("rw", vocabularyDB.notebooks, async () => {
    const old = await requireNotebook(id),
      finalName = await uniqueName(name, id)
    const notebook = {
      ...old,
      name: finalName,
      nameKey: normalizeAnswer(finalName),
      updatedAt: Math.max(Date.now(), old.updatedAt + 1),
    }
    await vocabularyDB.notebooks.put(notebook)
    return publicNotebook(notebook)
  })
}
export async function setActiveNotebook(id: string) {
  await vocabularyDB.transaction("rw", vocabularyDB.notebooks, vocabularyDB.meta, async () => {
    await requireNotebook(id)
    await vocabularyDB.meta.put({ key: "activeNotebookId", value: id })
  })
}
export async function resolveNotebookId(id?: string): Promise<string> {
  if (id) {
    await requireNotebook(id)
    return id
  }
  return vocabularyDB.transaction("rw", vocabularyDB.notebooks, vocabularyDB.meta, async () => {
    const snapshot = await getNotebookSnapshot()
    if (snapshot.activeNotebookId) return snapshot.activeNotebookId
    const now = Date.now(),
      notebook = {
        id: getRandomUUID(),
        name: "Sổ 1",
        nameKey: "sổ 1",
        createdAt: now,
        updatedAt: now,
      }
    await vocabularyDB.notebooks.add(notebook)
    await vocabularyDB.meta.put({ key: "activeNotebookId", value: notebook.id })
    return notebook.id
  })
}
export async function loadLibrary(id?: string) {
  const snapshot = await getNotebookSnapshot()
  const notebook =
    snapshot.notebooks.find((n) => n.id === id) ??
    snapshot.notebooks.find((n) => n.id === snapshot.activeNotebookId) ??
    null
  if (!notebook) return { ...snapshot, notebook, cards: [], progress: [] }
  const [cards, progress] = await Promise.all([
    vocabularyDB.notebookCards.where("notebookId").equals(notebook.id).toArray(),
    vocabularyDB.notebookProgress.where("notebookId").equals(notebook.id).toArray(),
  ])
  return {
    ...snapshot,
    notebook,
    cards: cards.map(publicCard).sort((a, b) => b.createdAt - a.createdAt),
    progress: progress.map(publicProgress),
  }
}
export async function findCapturedVocabulary(captureKey: string) {
  const row = await vocabularyDB.notebookCards.where("captureKey").equals(captureKey).first()
  return row ? publicCard(row) : undefined
}
export async function getNotebookCard(cardId: string, notebookId: string) {
  const row = await vocabularyDB.notebookCards.get([notebookId, cardId])
  return row ? publicCard(row) : undefined
}
async function assertCapacity(notebookId: string) {
  const cards = (
    await vocabularyDB.notebookCards.where("notebookId").equals(notebookId).toArray()
  ).map(publicCard)
  if (cards.length > MAX_CARDS) throw new Error(`Mỗi sổ tối đa ${MAX_CARDS} từ.`)
  const progress = (
    await vocabularyDB.notebookProgress.where("notebookId").equals(notebookId).toArray()
  ).map(publicProgress)
  const encoder = new TextEncoder(),
    cardBytes = encoder.encode(JSON.stringify(cards)).length,
    progressBytes = encoder.encode(JSON.stringify(progress)).length
  if (cardBytes > 4 * 1024 * 1024 || progressBytes > 4 * 1024 * 1024)
    throw new Error("Dữ liệu sổ quá lớn để xuất ZIP. Hãy chia thành sổ nhỏ hơn.")
  const ids = [...new Set(cards.flatMap((c) => [c.audio.word, c.audio.example]))],
    audio = await vocabularyDB.audio.bulkGet(ids)
  if (audio.some((a) => !a)) throw new Error("Sổ thiếu audio.")
  const size = audio.reduce((n, a) => n + (a?.bytes.length ?? 0), 0) + cardBytes + progressBytes
  if (Math.ceil(size * 1.01) + 4096 + ids.length * 256 > MAX_ARCHIVE_BYTES)
    throw new Error("Sổ đã gần 64 MB. Hãy lưu sang sổ khác.")
}
export async function importLibrary(bundle: VocabularyBundle, targetId?: string) {
  return vocabularyDB.transaction("rw", tables(), async () => {
    const destination = bundle.notebook?.id ?? (await resolveNotebookId(targetId))
    if (bundle.notebook) {
      const incoming = notebookSchema.parse(bundle.notebook),
        existing = await vocabularyDB.notebooks.get(incoming.id)
      if (!existing || incoming.updatedAt > existing.updatedAt) {
        const name = await chooseImportedName(incoming.name, incoming.id)
        await vocabularyDB.notebooks.put({ ...incoming, name, nameKey: normalizeAnswer(name) })
      }
    } else await requireNotebook(destination)
    for (const asset of bundle.audio) await vocabularyDB.audio.put(asset)
    for (const card of bundle.cards) {
      const old = await vocabularyDB.notebookCards.get([destination, card.id])
      if (!old || card.updatedAt > old.updatedAt)
        await vocabularyDB.notebookCards.put({ ...card, notebookId: destination })
      if (!(await vocabularyDB.notebookProgress.get([destination, card.id])))
        await vocabularyDB.notebookProgress.put({
          ...emptyProgress(card.id),
          notebookId: destination,
        })
    }
    for (const incoming of bundle.progress) {
      const old = await vocabularyDB.notebookProgress.get([destination, incoming.cardId])
      await vocabularyDB.notebookProgress.put({
        ...mergeProgress(old, incoming),
        notebookId: destination,
      })
    }
    await assertCapacity(destination)
    await collectUnusedAudio()
    await vocabularyDB.meta.put({ key: "activeNotebookId", value: destination })
    return destination
  })
}
export async function saveGeneratedCard(
  card: VocabularyCard,
  audio: AudioAsset[],
  signal?: AbortSignal,
  id?: string,
) {
  const notebookId = await resolveNotebookId(id)
  return vocabularyDB.transaction("rw", tables(), async () => {
    signal?.throwIfAborted()
    await requireNotebook(notebookId)
    if (await vocabularyDB.notebookCards.get([notebookId, card.id])) return false
    await vocabularyDB.audio.bulkPut(audio)
    signal?.throwIfAborted()
    await vocabularyDB.notebookCards.add({ ...card, notebookId })
    await vocabularyDB.notebookProgress.put({ ...emptyProgress(card.id), notebookId })
    await assertCapacity(notebookId)
    signal?.throwIfAborted()
    return true
  })
}
export async function exportLibrary(id?: string): Promise<VocabularyBundle> {
  const notebookId = await resolveNotebookId(id)
  return vocabularyDB.transaction("r", tables(), async () => {
    const notebook = publicNotebook(await requireNotebook(notebookId))
    const cards = (
      await vocabularyDB.notebookCards.where("notebookId").equals(notebookId).toArray()
    ).map(publicCard)
    const progress = (
      await vocabularyDB.notebookProgress.where("notebookId").equals(notebookId).toArray()
    ).map(publicProgress)
    const audio = await vocabularyDB.audio.bulkGet([
      ...new Set(cards.flatMap((c) => [c.audio.word, c.audio.example])),
    ])
    if (audio.some((a) => !a)) throw new Error("Thiếu audio trong sổ.")
    return { notebook, cards, progress, audio: audio as AudioAsset[] }
  })
}
export async function reviewCard(cardId: string, mode: ReviewMode, grade: Grade, id?: string) {
  const notebookId = await resolveNotebookId(id)
  return vocabularyDB.transaction(
    "rw",
    vocabularyDB.notebookCards,
    vocabularyDB.notebookProgress,
    async () => {
      if (!(await vocabularyDB.notebookCards.get([notebookId, cardId])))
        throw new Error("Từ này đã được xóa ở cửa sổ khác.")
      const row = (await vocabularyDB.notebookProgress.get([notebookId, cardId])) ?? {
        ...emptyProgress(cardId),
        notebookId,
      }
      row[mode] = scheduleReview(row[mode], grade)
      await vocabularyDB.notebookProgress.put(row)
      return publicProgress(row)
    },
  )
}
async function collectUnusedAudio() {
  const used = new Set<string>()
  await vocabularyDB.notebookCards.each((c) => {
    used.add(c.audio.word)
    used.add(c.audio.example)
  })
  await vocabularyDB.audio.bulkDelete(
    (await vocabularyDB.audio.toCollection().primaryKeys()).filter((id) => !used.has(id)),
  )
}
export async function deleteVocabularyCard(cardId: string, id?: string) {
  const notebookId = await resolveNotebookId(id)
  await vocabularyDB.transaction("rw", tables(), async () => {
    await vocabularyDB.notebookCards.delete([notebookId, cardId])
    await vocabularyDB.notebookProgress.delete([notebookId, cardId])
    await collectUnusedAudio()
  })
}
export async function moveVocabularyCard(cardId: string, fromId: string, toId: string) {
  if (fromId === toId) return
  await vocabularyDB.transaction("rw", tables(), async () => {
    await requireNotebook(fromId)
    await requireNotebook(toId)
    const card = await vocabularyDB.notebookCards.get([fromId, cardId])
    if (!card) throw new Error("Không tìm thấy từ trong sổ nguồn.")
    const existing = await vocabularyDB.notebookCards.get([toId, cardId])
    if (!existing || card.updatedAt > existing.updatedAt)
      await vocabularyDB.notebookCards.put({ ...card, notebookId: toId })
    const sourceProgress =
      (await vocabularyDB.notebookProgress.get([fromId, cardId])) ?? emptyProgress(cardId)
    const targetProgress = await vocabularyDB.notebookProgress.get([toId, cardId])
    await vocabularyDB.notebookProgress.put({
      ...mergeProgress(targetProgress, sourceProgress),
      notebookId: toId,
    })
    await assertCapacity(toId)
    await vocabularyDB.notebookCards.delete([fromId, cardId])
    await vocabularyDB.notebookProgress.delete([fromId, cardId])
    await collectUnusedAudio()
  })
}
export async function clearVocabularyLibrary(id?: string) {
  const notebookId = await resolveNotebookId(id)
  await vocabularyDB.transaction("rw", tables(), async () => {
    await vocabularyDB.notebookCards.where("notebookId").equals(notebookId).delete()
    await vocabularyDB.notebookProgress.where("notebookId").equals(notebookId).delete()
    await collectUnusedAudio()
  })
}
