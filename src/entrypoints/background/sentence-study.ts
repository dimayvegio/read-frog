import type { Browser } from "wxt/browser"
import { z } from "zod"
import { browser } from "#imports"
import { db } from "@/utils/db/dexie/db"
import { Sha256Hex } from "@/utils/hash"
import { getProviderCacheIdentity } from "@/utils/providers/provider-ref"
import { resolveSubtitlesProviderRef } from "@/utils/subtitles/processor/translator"
import {
  parseStudyEnds,
  STUDY_PROMPT_VERSION,
  STUDY_SEGMENTATION_INSTRUCTIONS,
  validateStudyWords,
  type StudyWord,
} from "@/utils/subtitles/study-segmentation"
import {
  createStartMessageParser,
  createStreamPortHandler,
  generateTextForProviderRef,
} from "./background-stream"
import { ensureInitializedConfig } from "./config"
import { readOpenAIKeyStatus } from "./openai-credentials"
import { recordCacheHit } from "./usage"

export async function segmentStudyWindow(input: unknown, signal: AbortSignal): Promise<number[]> {
  const words = validateStudyWords(input)
  signal.throwIfAborted()
  const config = await ensureInitializedConfig()
  const providerRef = await resolveSubtitlesProviderRef(config, "segmentation")
  const credential = await readOpenAIKeyStatus()
  signal.throwIfAborted()
  if (!providerRef || !credential.configured)
    throw new Error("Configure OpenAI before sentence study")
  const identity = getProviderCacheIdentity(providerRef)
  const json = JSON.stringify(words)
  const key = Sha256Hex(STUDY_PROMPT_VERSION, identity, String(credential.revision), json)
  const cached = await db.aiSegmentationCache.get(key)
  signal.throwIfAborted()
  if (cached) {
    let ends: number[] | undefined
    try {
      ends = parseStudyEnds(cached.result, words)
    } catch {
      await db.aiSegmentationCache.delete(key)
    }
    if (ends) {
      await recordCacheHit("segmentation")
      signal.throwIfAborted()
      return ends
    }
  }
  const text = await generateTextForProviderRef(
    {
      providerRef,
      usageTask: "segmentation",
      instructions: STUDY_SEGMENTATION_INSTRUCTIONS,
      prompt: JSON.stringify({
        words: words.map((word, i) => ({ i, t: word.text, s: word.start, e: word.end })),
      }),
    },
    { signal },
  )
  signal.throwIfAborted()
  const ends = parseStudyEnds(text, words)
  const current = await resolveSubtitlesProviderRef(await ensureInitializedConfig(), "segmentation")
  const currentCredential = await readOpenAIKeyStatus()
  signal.throwIfAborted()
  if (
    !current ||
    getProviderCacheIdentity(current) !== identity ||
    currentCredential.revision !== credential.revision
  )
    throw new Error("OpenAI configuration changed; retry sentence study")
  await db.aiSegmentationCache.put({ key, result: JSON.stringify({ ends }), createdAt: new Date() })
  signal.throwIfAborted()
  return ends
}

export function isYouTubeStudySender(
  sender:
    | (Pick<Browser.runtime.MessageSender, "id" | "frameId" | "url"> & { tab?: { id?: number } })
    | undefined,
): boolean {
  if (sender?.id !== browser.runtime.id || sender.frameId !== 0 || !sender.tab?.id) return false
  try {
    const url = new URL(sender.url ?? "")
    return url.protocol === "https:" && /(^|\.)youtube\.com$/.test(url.hostname)
  } catch {
    return false
  }
}

const handlePort = createStreamPortHandler(
  async (words: unknown, options) =>
    segmentStudyWindow(
      words,
      AbortSignal.any([options.signal ?? new AbortController().signal, AbortSignal.timeout(90000)]),
    ),
  createStartMessageParser(
    z.custom<StudyWord[]>((value) => {
      try {
        validateStudyWords(value)
        return true
      } catch {
        return false
      }
    }),
  ),
)

export function handleSentenceStudyPort(port: Browser.runtime.Port) {
  if (!isYouTubeStudySender(port.sender)) {
    port.disconnect()
    return
  }
  handlePort(port)
}
