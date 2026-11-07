import type { Browser } from "wxt/browser"
import { z } from "zod"
import { browser } from "#imports"
import { Sha256Hex } from "@/utils/hash"
import { onMessage } from "@/utils/message"
import { validatePracticeWav } from "@/utils/pronunciation/audio"
import {
  clearPronunciationHistory,
  pronunciationDB,
  pronunciationEpoch,
  saveAttempt,
} from "@/utils/pronunciation/db"
import { buildPronunciationInstructions } from "@/utils/pronunciation/prompt"
import {
  parsePronunciationFeedback,
  PronunciationResponseError,
} from "@/utils/pronunciation/response"
import {
  captureSchema,
  PRONUNCIATION_MODEL,
  PRONUNCIATION_RUBRIC,
  requestSchema,
  referenceKey,
  overallScore,
  wordTokens,
  type PronunciationCapture,
  type PronunciationAttempt,
  type PronunciationRequest,
  type PronunciationResult,
} from "@/utils/pronunciation/schema"
import {
  BackgroundStreamError,
  createStartMessageParser,
  createStreamPortHandler,
} from "./background-stream"
import { ensureInitializedConfig } from "./config"
import { readOpenAIExecutionCredential, readOpenAIKeyStatus } from "./openai-credentials"
import { isTrustedOptionsSender } from "./settings-sender"
import { beginUsage, recordCacheHit } from "./usage"

const pageURL = () => browser.runtime.getURL("/pronunciation.html")
// Only fixed app-authored text may bypass the shared provider-error redaction.
const practiceError = (message: string) => new BackgroundStreamError("pronunciation", message)
const captures = new Map<string, { value: PronunciationCapture; at: number }>()
type Job = { controller: AbortController; promise: Promise<PronunciationResult>; users: number }
const jobs = new Map<string, Job>()
export function trustedPronunciation(sender: Browser.runtime.MessageSender | undefined) {
  return isTrustedOptionsSender(sender, browser.runtime.id, pageURL())
}
export function setupPronunciationHandlers() {
  onMessage("openPronunciation", async (message) => {
    if (message.sender.id !== browser.runtime.id)
      throw practiceError("Invalid pronunciation sender")
    const value = captureSchema.parse(message.data)
    for (const [key, item] of captures) if (Date.now() - item.at > 600000) captures.delete(key)
    const channel = crypto.randomUUID()
    if (captures.size >= 10) captures.delete(captures.keys().next().value!)
    captures.set(channel, { value, at: Date.now() })
    const url = `${pageURL()}?channel=${channel}`
    try {
      try {
        await browser.windows.create({ url, type: "popup", width: 800, height: 860 })
      } catch {
        await browser.tabs.create({ url, active: true })
      }
    } catch {
      captures.delete(channel)
      throw practiceError("Không mở được khung phát âm.")
    }
  })
  onMessage("consumePronunciationCapture", (message) => {
    if (!trustedPronunciation(message.sender)) throw practiceError("Invalid pronunciation page")
    const item = captures.get(message.data.channel)
    captures.delete(message.data.channel)
    return item && Date.now() - item.at < 600000 ? item.value : null
  })
  onMessage("clearPronunciationHistory", async (message) => {
    if (!trustedPronunciation(message.sender)) throw practiceError("Invalid pronunciation page")
    for (const job of jobs.values()) job.controller.abort()
    jobs.clear()
    return clearPronunciationHistory()
  })
}

const responseSchema = z.object({
  model: z.string().min(1).max(160),
  choices: z
    .array(
      z.object({
        finish_reason: z.literal("stop"),
        message: z.object({ content: z.string().min(1).max(60000) }),
      }),
    )
    .min(1)
    .max(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      prompt_tokens_details: z
        .object({ cached_tokens: z.number().int().nonnegative().optional() })
        .optional(),
    })
    .optional(),
})
async function boundedResponse(response: Response) {
  if (!response.body) throw practiceError("OpenAI không trả về kết quả.")
  const reader = response.body.getReader(),
    decoder = new TextDecoder()
  let size = 0,
    text = ""
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 256 * 1024) throw practiceError("Kết quả chấm vượt giới hạn.")
      text += decoder.decode(value, { stream: true })
    }
    return JSON.parse(text + decoder.decode()) as unknown
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
async function stillCurrent(revision: number, epoch: number, signal: AbortSignal) {
  signal.throwIfAborted()
  const [status, currentEpoch] = await Promise.all([readOpenAIKeyStatus(), pronunciationEpoch()])
  signal.throwIfAborted()
  if (!status.configured || status.revision !== revision || currentEpoch !== epoch)
    throw practiceError("Khóa OpenAI hoặc lịch sử đã đổi. Hãy chấm lại.")
}
async function execute(
  input: PronunciationRequest,
  key: string,
  revision: number,
  epoch: number,
  signal: AbortSignal,
): Promise<PronunciationResult> {
  const audio = validatePracticeWav(input.wav)
  const cached = await pronunciationDB.attempts.where("evaluationKey").equals(key).first()
  if (cached) {
    await stillCurrent(revision, epoch, signal)
    await recordCacheHit("other")
    return { attempt: cached, saved: true, cached: true, epoch }
  }
  const credential = await readOpenAIExecutionCredential()
  if (credential.revision !== revision) throw practiceError("Khóa OpenAI đã đổi. Hãy chấm lại.")
  const span = await beginUsage("other", PRONUNCIATION_MODEL)
  try {
    await stillCurrent(revision, epoch, signal)
    // Dedicated fixed audio endpoint. The existing Responses-only executor is unchanged.
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential.apiKey}` },
      body: JSON.stringify({
        model: PRONUNCIATION_MODEL,
        modalities: ["text"],
        store: false,
        temperature: 0,
        max_completion_tokens: 4500,
        messages: [
          { role: "system", content: buildPronunciationInstructions(input.text) },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  target: "en-US",
                  reference: input.text,
                  context: input.context,
                  words: wordTokens(input.text).map((text, i) => ({ i, text })),
                }),
              },
              { type: "input_audio", input_audio: { data: input.wav, format: "wav" } },
            ],
          },
        ],
      }),
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw practiceError(
        response.status === 429
          ? "OpenAI giới hạn yêu cầu hoặc hết hạn mức. Hãy kiểm tra tài khoản rồi thử lại."
          : response.status === 401
            ? "Khóa OpenAI không hợp lệ. Mở cài đặt để kiểm tra."
            : `OpenAI chưa chấm được (HTTP ${response.status}). Hãy thử lại.`,
      )
    }
    let parsed: z.infer<typeof responseSchema>
    try {
      parsed = responseSchema.parse(await boundedResponse(response))
    } catch {
      throw practiceError("OpenAI trả về kết quả chưa đầy đủ. Chưa ghi điểm; bạn có thể thử lại.")
    }
    // Actual mixed-modality usage is counted. Cost stays unknown until the usage format can price each modality.
    await span.finish("complete", {
      input: parsed.usage?.prompt_tokens ?? null,
      output: parsed.usage?.completion_tokens ?? null,
      cachedInput: parsed.usage?.prompt_tokens_details?.cached_tokens ?? null,
      audioMs: audio.audioMs,
    })
    let feedback
    try {
      feedback = parsePronunciationFeedback(parsed.choices[0]!.message.content, input.text)
    } catch (error) {
      throw practiceError(
        error instanceof PronunciationResponseError
          ? error.message
          : "Không đọc được phản hồi chấm phát âm. Chưa ghi điểm. Mã PA-RESPONSE.",
      )
    }
    await stillCurrent(revision, epoch, signal)
    const attempt: PronunciationAttempt = {
      id: crypto.randomUUID(),
      evaluationKey: key,
      referenceKey: referenceKey(input.text, input.context),
      text: input.text,
      context: input.context,
      audioHash: audio.hash,
      audioMs: audio.audioMs,
      createdAt: Date.now(),
      rubric: PRONUNCIATION_RUBRIC,
      model: parsed.model,
      feedback,
      score: overallScore(feedback, input.text),
    }
    const saved = await saveAttempt(attempt, epoch, signal).catch(async () => {
      await stillCurrent(revision, epoch, signal)
      return { attempt, saved: false }
    })
    await stillCurrent(revision, epoch, signal)
    return { ...saved, cached: false, epoch }
  } catch (error) {
    await span.finish(signal.aborted ? "cancelled" : "error", { audioMs: audio.audioMs })
    throw error
  }
}
function subscribe(job: Job, signal: AbortSignal): Promise<PronunciationResult> {
  job.users++
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", abort)
      job.users--
      if (job.users === 0) job.controller.abort()
      callback()
    }
    const abort = () => finish(() => reject(new DOMException("Đã hủy chấm.", "AbortError")))
    signal.addEventListener("abort", abort, { once: true })
    job.promise.then(
      (result) => finish(() => resolve(result)),
      (error: unknown) => finish(() => reject(error)),
    )
    if (signal.aborted) abort()
  })
}
export async function assessPronunciation(
  raw: PronunciationRequest,
  signal: AbortSignal,
): Promise<PronunciationResult> {
  const input = requestSchema.parse(raw)
  input.text = input.text.normalize("NFC").trim()
  input.context = input.context.normalize("NFC").trim()
  const audio = validatePracticeWav(input.wav)
  await ensureInitializedConfig()
  const status = await readOpenAIKeyStatus(),
    epoch = await pronunciationEpoch()
  signal.throwIfAborted()
  if (!status.configured) throw practiceError("Cần lưu khóa OpenAI trong cài đặt trước khi chấm.")
  const key = Sha256Hex(
    JSON.stringify([
      "pronunciation-audio-prompt-v2",
      referenceKey(input.text, input.context),
      audio.hash,
      status.revision,
    ]),
  )
  const jobKey = `${epoch}:${key}`
  let job = jobs.get(jobKey)
  if (job?.controller.signal.aborted) {
    jobs.delete(jobKey)
    job = undefined
  }
  if (!job) {
    if (jobs.size >= 3)
      throw practiceError("Đang có nhiều bản thu được chấm. Chờ một bản hoàn tất.")
    const controller = new AbortController()
    job = {
      controller,
      users: 0,
      promise: execute(
        input,
        key,
        status.revision,
        epoch,
        AbortSignal.any([controller.signal, AbortSignal.timeout(90000)]),
      ),
    }
    jobs.set(jobKey, job)
    const current = job
    void job.promise
      .finally(() => {
        if (jobs.get(jobKey) === current) jobs.delete(jobKey)
      })
      .catch(() => {})
  }
  return subscribe(job, signal)
}
const handler = createStreamPortHandler(
  assessPronunciationWithOptions,
  createStartMessageParser<PronunciationRequest>(requestSchema),
)
async function assessPronunciationWithOptions(
  input: PronunciationRequest,
  options: { signal?: AbortSignal },
) {
  return assessPronunciation(input, options.signal ?? new AbortController().signal)
}
export function handlePronunciationPort(port: Browser.runtime.Port) {
  if (!trustedPronunciation(port.sender)) {
    port.disconnect()
    return
  }
  handler(port)
}
