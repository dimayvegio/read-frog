import { Dexie, type Table } from "dexie"
import { getRandomUUID } from "../crypto-polyfill"
import { migrateVocabularyV1ToV2 } from "./migrations/v1-to-v2"
import {
  reviewEventSchema,
  sameReviewAnswer,
  MAX_REVIEW_EVENTS,
  MAX_REVIEW_LOG_BYTES,
  type ReviewEvent,
  type ReviewAttempt,
} from "./review-log"
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
  reviewEvents!: Table<ReviewEvent & { notebookId: string }, [string, string]>
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
    // New empty log store. Published v1/v2 stores and their migration are frozen.
    // Existing schedule counters cannot reconstruct historical answer outcomes.
    this.version(3).stores({ reviewEvents: "&[notebookId+id], notebookId, [notebookId+cardId]" })
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
  vocabularyDB.reviewEvents,
]

export async function loadReviewEvents(notebookId: string): Promise<ReviewEvent[]> {
  return (await vocabularyDB.reviewEvents.where("notebookId").equals(notebookId).toArray()).map(
    ({ notebookId: _notebookId, ...event }) => event,
  )
}
export async function getReviewEvent(
  notebookId: string,
  id: string,
): Promise<ReviewEvent | undefined> {
  const row = await vocabularyDB.reviewEvents.get([notebookId, id])
  if (!row) return undefined
  const { notebookId: _notebookId, ...event } = row
  return event
}
async function resetLogBudget(notebookId: string) {
  const events = await loadReviewEvents(notebookId),
    bytes = new TextEncoder().encode(JSON.stringify(events)).length
  await vocabularyDB.meta.put({
    key: `logBudget:${notebookId}`,
    value: JSON.stringify({ count: events.length, bytes }),
  })
}
async function putReviewEvent(notebookId: string, input: ReviewEvent) {
  const event = reviewEventSchema.parse(input),
    previous = await vocabularyDB.reviewEvents.get([notebookId, event.id])
  if (previous) {
    const { notebookId: _notebookId, ...old } = previous
    if (!sameReviewAnswer(old, event)) throw new Error("Nhật ký trùng ID nhưng khác câu trả lời.")
    if (event.gradedAt <= previous.gradedAt) return
  }
  const key = `logBudget:${notebookId}`
  if (!(await vocabularyDB.meta.get(key))) await resetLogBudget(notebookId)
  const budget = JSON.parse((await vocabularyDB.meta.get(key))!.value) as {
    count: number
    bytes: number
  }
  const encoder = new TextEncoder(),
    old = previous
      ? (() => {
          const { notebookId: _notebookId, ...row } = previous
          return row
        })()
      : null
  const count = budget.count + (previous ? 0 : 1),
    bytes =
      budget.bytes +
      encoder.encode(JSON.stringify(event)).length -
      (old ? encoder.encode(JSON.stringify(old)).length : 0) +
      (previous || budget.count === 0 ? 0 : 1)
  if (count > MAX_REVIEW_EVENTS || bytes > MAX_REVIEW_LOG_BYTES)
    throw new Error("Nhật ký đã đầy. Tải báo cáo rồi xóa nhật ký để tiếp tục ghi.")
  await vocabularyDB.reviewEvents.put({ ...event, notebookId })
  await vocabularyDB.meta.put({ key, value: JSON.stringify({ count, bytes }) })
}
export async function clearReviewEvents(notebookId: string) {
  await vocabularyDB.transaction("rw", vocabularyDB.reviewEvents, vocabularyDB.meta, async () => {
    await vocabularyDB.reviewEvents.where("notebookId").equals(notebookId).delete()
    await vocabularyDB.meta.delete(`logBudget:${notebookId}`)
  })
}
function eventFromCard(
  card: VocabularyCard,
  mode: ReviewMode,
  attempt: ReviewAttempt,
  result: ReviewEvent["result"],
  answer: string,
  grade: Grade | null = null,
): ReviewEvent {
  const now = Date.now()
  return reviewEventSchema.parse({
    ...attempt,
    cardId: card.id,
    occurredAt: now,
    mode,
    result,
    word: card.word,
    language: card.language,
    meaning: card.meaning.slice(0, 200),
    answer: answer.slice(0, 300),
    grade,
    gradedAt: grade ? Math.max(now, 1) : 0,
  })
}
export async function recordReviewAnswer(
  cardId: string,
  mode: "choice" | "type",
  result: "correct" | "incorrect" | "revealed",
  answer: string,
  attempt: ReviewAttempt,
  notebookId: string,
) {
  return vocabularyDB.transaction(
    "rw",
    vocabularyDB.notebookCards,
    vocabularyDB.reviewEvents,
    vocabularyDB.meta,
    async () => {
      const card = await vocabularyDB.notebookCards.get([notebookId, cardId])
      if (!card) throw new Error("Từ đã bị xóa ở cửa sổ khác.")
      const existing = await vocabularyDB.reviewEvents.get([notebookId, attempt.id])
      if (existing) {
        if (
          existing.cardId !== cardId ||
          existing.mode !== mode ||
          existing.sessionId !== attempt.sessionId
        )
          throw new Error("Invalid attempt ID")
        const { notebookId: _notebookId, ...event } = existing
        return event // Retry cannot count or replace the first answer twice.
      }
      const event = eventFromCard(card, mode, attempt, result, answer)
      await putReviewEvent(notebookId, event)
      return event
    },
  )
}
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
  const logBytes = new TextEncoder().encode(
    JSON.stringify(await loadReviewEvents(notebookId)),
  ).length
  const size =
    audio.reduce((n, a) => n + (a?.bytes.length ?? 0), 0) + cardBytes + progressBytes + logBytes
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
    for (const event of bundle.events ?? []) await putReviewEvent(destination, event)
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
    const events = await loadReviewEvents(notebookId)
    return {
      notebook,
      cards,
      progress,
      audio: audio as AudioAsset[],
      ...(events.length ? { events } : {}),
    }
  })
}
export async function reviewCard(
  cardId: string,
  mode: ReviewMode,
  grade: Grade,
  id?: string,
  attempt?: ReviewAttempt,
) {
  const notebookId = await resolveNotebookId(id)
  return vocabularyDB.transaction(
    "rw",
    vocabularyDB.notebookCards,
    vocabularyDB.notebookProgress,
    vocabularyDB.reviewEvents,
    vocabularyDB.meta,
    async () => {
      const card = await vocabularyDB.notebookCards.get([notebookId, cardId])
      if (!card) throw new Error("Từ này đã được xóa ở cửa sổ khác.")
      const row = (await vocabularyDB.notebookProgress.get([notebookId, cardId])) ?? {
        ...emptyProgress(cardId),
        notebookId,
      }
      if (attempt) {
        const existing = await vocabularyDB.reviewEvents.get([notebookId, attempt.id])
        if (
          existing &&
          (existing.cardId !== cardId ||
            existing.mode !== mode ||
            existing.sessionId !== attempt.sessionId)
        )
          throw new Error("Invalid attempt ID")
        if (existing?.grade) return publicProgress(row)
        if (
          existing &&
          (existing.result === "incorrect" || existing.result === "revealed") &&
          grade !== "again"
        )
          throw new Error("Câu sai hoặc mở đáp án chỉ được chấm Chưa nhớ.")
        const event = existing
          ? (() => {
              const { notebookId: _notebookId, ...value } = existing
              return value
            })()
          : eventFromCard(card, mode, attempt, "self", "", grade)
        await putReviewEvent(notebookId, { ...event, grade, gradedAt: Math.max(Date.now(), 1) })
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
    for (const event of await loadReviewEvents(fromId))
      if (event.cardId === cardId) {
        await putReviewEvent(toId, event)
        await vocabularyDB.reviewEvents.delete([fromId, event.id])
      }
    await resetLogBudget(fromId)
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
    await vocabularyDB.reviewEvents.where("notebookId").equals(notebookId).delete()
    await vocabularyDB.meta.delete(`logBudget:${notebookId}`)
    await collectUnusedAudio()
  })
}
