import type { QueryClient } from "@tanstack/react-query"
import type { OpenAITTSConfig, TTSAudioChunk } from "@/types/openai-tts"

interface PendingAudio {
  promise: Promise<TTSAudioChunk>
  signal: AbortSignal
}
const jobs = new WeakMap<QueryClient, Map<string, PendingAudio>>()
export function openAIAudioKey(text: string, config: OpenAITTSConfig, revision: number) {
  return [
    "tts-audio",
    "openai",
    {
      text,
      model: config.model,
      voice: config.voice,
      speed: config.speed,
      instructions: config.instructions,
      credentialRevision: revision,
    },
  ] as const
}
function waitForAudio(
  promise: Promise<TTSAudioChunk>,
  signal: AbortSignal,
): Promise<TTSAudioChunk> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Audio request cancelled", "AbortError"))
    signal.addEventListener("abort", abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort))
  })
}
/** Completed chunks and in-flight work are shared, while cancellation stays owned by its caller. */
export async function getOpenAIAudio(
  client: QueryClient,
  text: string,
  config: OpenAITTSConfig,
  revision: number,
  signal: AbortSignal,
  generate: () => Promise<TTSAudioChunk>,
): Promise<TTSAudioChunk> {
  signal.throwIfAborted()
  const key = openAIAudioKey(text, config, revision)
  const cached = client.getQueryData<TTSAudioChunk>(key)
  if (cached) return cached
  let pending = jobs.get(client)
  if (!pending) {
    pending = new Map()
    jobs.set(client, pending)
  }
  const id = JSON.stringify(key),
    existing = pending.get(id)
  if (existing) {
    try {
      return await waitForAudio(existing.promise, signal)
    } catch (error) {
      signal.throwIfAborted()
      // A stopped speaker must not cancel an independently requested download.
      if (!existing.signal.aborted) throw error
      const replacement = pending.get(id)
      if (replacement && replacement !== existing) return waitForAudio(replacement.promise, signal)
    }
  }
  const job: PendingAudio = {
    signal,
    promise: Promise.resolve()
      .then(generate)
      .then((audio) => {
        signal.throwIfAborted()
        client.setQueryData(key, audio)
        return audio
      }),
  }
  pending.set(id, job)
  void job.promise
    .finally(() => {
      if (pending.get(id) === job) pending.delete(id)
    })
    .catch(() => {})
  return waitForAudio(job.promise, signal)
}
