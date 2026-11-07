import type { PronunciationAttempt } from "./schema"
import { Dexie, type Table } from "dexie"

class PronunciationDB extends Dexie {
  attempts!: Table<PronunciationAttempt, string>
  meta!: Table<{ key: string; value: number }, string>
  constructor() {
    super("read-frog-pronunciation")
    // Published v1: independent of reading recordings, vocabulary/SRS and config sync.
    this.version(1).stores({
      attempts: "&id, &evaluationKey, referenceKey, createdAt",
      meta: "&key",
    })
  }
}
export const pronunciationDB = new PronunciationDB()
export async function pronunciationEpoch() {
  return (await pronunciationDB.meta.get("epoch"))?.value ?? 0
}
export async function saveAttempt(
  attempt: PronunciationAttempt,
  epoch: number,
  signal?: AbortSignal,
) {
  return pronunciationDB.transaction(
    "rw",
    pronunciationDB.attempts,
    pronunciationDB.meta,
    async () => {
      signal?.throwIfAborted()
      const transaction = Dexie.currentTransaction
      const abort = () => transaction.abort()
      signal?.addEventListener("abort", abort, { once: true })
      try {
        if ((await pronunciationEpoch()) !== epoch)
          throw new Error("Lịch sử đã được xóa. Hãy chấm lại nếu muốn lưu.")
        const prior = await pronunciationDB.attempts
          .where("evaluationKey")
          .equals(attempt.evaluationKey)
          .first()
        if (prior) return { attempt: prior, saved: true }
        const all = await pronunciationDB.attempts.toArray()
        const bytes = new TextEncoder().encode(JSON.stringify([...all, attempt])).length
        if (all.length >= 1000 || bytes > 16 * 1024 * 1024) return { attempt, saved: false }
        await pronunciationDB.attempts.add(attempt)
        signal?.throwIfAborted()
        return { attempt, saved: true }
      } finally {
        signal?.removeEventListener("abort", abort)
      }
    },
  )
}
export async function clearPronunciationHistory() {
  return pronunciationDB.transaction(
    "rw",
    pronunciationDB.attempts,
    pronunciationDB.meta,
    async () => {
      const epoch = (await pronunciationEpoch()) + 1
      await pronunciationDB.meta.put({ key: "epoch", value: epoch })
      await pronunciationDB.attempts.clear()
      return epoch
    },
  )
}
