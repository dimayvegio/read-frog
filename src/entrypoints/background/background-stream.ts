import type { Browser } from "#imports"
import type { BackgroundGenerateTextPayload } from "@/types/background-generate-text"
import type {
  BackgroundStreamPortName,
  BackgroundStreamSnapshot,
  BackgroundStreamStructuredObjectSerializablePayload,
  BackgroundStreamTextSerializablePayload,
  BackgroundStructuredObjectStreamSnapshot,
  BackgroundTextStreamSnapshot,
  BackgroundStreamImageSerializablePayload,
  StartMessageParseResult,
  StreamPortHandler,
  StreamPortRequestMessage,
  StreamPortResponse,
  StreamPortResponseWithoutStreamRequestId,
  StreamRuntimeOptions,
  ThinkingSnapshot,
} from "@/types/background-stream"
import type { ErrorAction } from "@/utils/error-action"
import { generateText, Output, parsePartialJson, streamText } from "ai"
import { z } from "zod"
import { browser } from "#imports"
import { BACKGROUND_STREAM_PORTS } from "@/types/background-stream"
import { imagePairSchema, imagePairWireSchema } from "@/types/image-translation"
import {
  openAIGeneratePayloadSchema,
  openAIStructuredPayloadSchema,
  openAITextPayloadSchema,
  openAIImagePayloadSchema,
} from "@/types/openai-execution"
import { createStructuredObjectSchema } from "@/utils/ai/structured-object-schema"
import { safeOpenAIErrorMessage } from "@/utils/error/openai"
import { logger } from "@/utils/logger"
import { resolveOpenAIExecution } from "./openai-runtime"
import { isTrustedOptionsSender } from "./settings-sender"

const invalidStreamStartPayloadMessage = "Invalid stream start payload"
const aiStreamProtocolErrorMessage = "Invalid AI stream response."
const aiOutputValidationErrorMessage = "AI output does not match the expected format."
const aiOutputLengthLimitErrorMessage =
  "The AI output reached the length limit. Please reduce the requested output length and try again."

type AiStreamPart = Record<string, unknown> & { type: string }

function createStreamAbortError(message: string) {
  return new DOMException(message, "AbortError")
}

function isAbortLikeError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  )
}

const streamPortStartEnvelopeSchema = z.object({
  type: z.literal("start"),
  streamRequestId: z.string().trim().min(1),
  payload: z.unknown(),
})

const streamTextPayloadSchema = openAITextPayloadSchema
const structuredObjectPayloadSchema = openAIStructuredPayloadSchema

export function createStartMessageParser<TSerializablePayload>(payloadSchema: z.ZodTypeAny) {
  return (msg: unknown): StartMessageParseResult<TSerializablePayload> => {
    const envelopeResult = streamPortStartEnvelopeSchema.safeParse(msg)
    if (!envelopeResult.success) {
      return { success: false }
    }

    const payloadResult = payloadSchema.safeParse(envelopeResult.data.payload)
    if (!payloadResult.success) {
      return {
        success: false,
        streamRequestId: envelopeResult.data.streamRequestId,
      }
    }

    return {
      success: true,
      message: {
        type: "start",
        streamRequestId: envelopeResult.data.streamRequestId,
        payload: payloadResult.data as TSerializablePayload,
      },
    }
  }
}

export function createStreamPortHandler<TSerializablePayload, TResponse>(
  streamFn: (
    serializablePayload: TSerializablePayload,
    options: StreamRuntimeOptions<TResponse>,
  ) => Promise<TResponse>,
  startMessageParser: (msg: unknown) => StartMessageParseResult<TSerializablePayload>,
) {
  return (port: Browser.runtime.Port) => {
    const abortController = new AbortController()
    let isActive = true
    let hasStarted = false
    let streamRequestId: string | undefined
    let messageListener: ((rawMessage: unknown) => void) | undefined
    let disconnectListener: (() => void) | undefined

    const safePost = (response: StreamPortResponseWithoutStreamRequestId<TResponse>) => {
      if (!isActive || abortController.signal.aborted || !streamRequestId) {
        return
      }
      try {
        const message: StreamPortResponse<TResponse> = {
          ...response,
          streamRequestId,
        }
        port.postMessage(message)
      } catch (error) {
        logger.error("[Background] Stream port post failed", error)
      }
    }

    const cleanup = () => {
      if (!isActive) {
        return
      }
      isActive = false
      if (messageListener) {
        port.onMessage.removeListener(messageListener)
      }
      if (disconnectListener) {
        port.onDisconnect.removeListener(disconnectListener)
      }
    }

    disconnectListener = () => {
      abortController.abort(createStreamAbortError("stream port disconnected"))
      cleanup()
    }

    messageListener = async (rawMessage: unknown) => {
      const requestMessage = rawMessage as
        | StreamPortRequestMessage<TSerializablePayload>
        | undefined
      if (requestMessage?.type === "ping") {
        return
      }

      if (hasStarted) {
        return
      }

      const parseResult = startMessageParser(rawMessage)
      if (!parseResult.success) {
        if (parseResult.streamRequestId) {
          streamRequestId = parseResult.streamRequestId
          safePost({
            type: "error",
            error: { message: invalidStreamStartPayloadMessage },
          })
        }

        cleanup()
        try {
          port.disconnect()
        } catch {
          // The port may already be closed due to a race with onDisconnect.
          // This is expected during cleanup and safe to ignore.
        }
        return
      }

      const startMessage = parseResult.message
      streamRequestId = startMessage.streamRequestId
      hasStarted = true
      let streamError: unknown

      try {
        const result = await streamFn(startMessage.payload, {
          signal: abortController.signal,
          onChunk: (snapshot) => {
            safePost({ type: "chunk", data: snapshot })
          },
          onError: (error) => {
            if (streamError === undefined) {
              streamError = error
            }
          },
        })

        if (streamError !== undefined) {
          throw streamError instanceof Error
            ? new Error(streamError.message, { cause: streamError })
            : new Error(typeof streamError === "string" ? streamError : "Unknown stream error")
        }

        if (!abortController.signal.aborted) {
          safePost({ type: "done", data: result })
        }
      } catch (error) {
        const finalError = streamError ?? error
        if (abortController.signal.aborted || isAbortLikeError(finalError)) {
          return
        }

        logger.error("[Background] Stream request failed")
        safePost({
          type: "error",
          error: {
            message:
              finalError instanceof BackgroundStreamError
                ? finalError.message
                : safeOpenAIErrorMessage(finalError),
            action: finalError instanceof BackgroundStreamError ? finalError.action : undefined,
          },
        })
      } finally {
        cleanup()
        try {
          port.disconnect()
        } catch {
          // The port may already be closed due to a race with onDisconnect.
          // This is expected during cleanup and safe to ignore.
        }
      }
    }

    port.onMessage.addListener(messageListener)
    port.onDisconnect.addListener(disconnectListener)
  }
}

function createStreamSnapshot<TOutput>(
  output: TOutput,
  thinking: ThinkingSnapshot,
): BackgroundStreamSnapshot<TOutput> {
  return {
    output: output !== null && typeof output === "object" ? { ...output } : output,
    thinking: { ...thinking },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

class BackgroundStreamError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: { cause?: unknown; retryAfterMs?: number; action?: ErrorAction },
  ) {
    super(message, { cause: options?.cause })
    this.retryAfterMs = options?.retryAfterMs
    this.action = options?.action
  }

  readonly retryAfterMs?: number
  readonly action?: ErrorAction
}

function toAiStreamPart(part: unknown): AiStreamPart {
  if (!isRecord(part) || typeof part.type !== "string" || part.type.trim().length === 0) {
    throw new BackgroundStreamError("stream_protocol_error", aiStreamProtocolErrorMessage)
  }

  return part as AiStreamPart
}

function getStringPartField(part: Record<string, unknown>, field: string): string {
  const value = part[field]
  if (typeof value !== "string") {
    throw new BackgroundStreamError("stream_protocol_error", aiStreamProtocolErrorMessage)
  }

  return value
}

function getStreamPartError(part: Record<string, unknown>): unknown {
  return "error" in part
    ? part.error
    : new BackgroundStreamError("stream_protocol_error", aiStreamProtocolErrorMessage)
}

function getStreamFinishReason(part: Record<string, unknown>): string | undefined {
  return typeof part.finishReason === "string" ? part.finishReason : undefined
}

/**
 * Reasoning is over once the answer starts coming out, so the first output delta
 * closes the thinking phase. Models that emit no reasoning at all never send
 * `reasoning-end`, and without this they would stay "thinking" for the whole
 * stream while their output is already rendering. Models that interleave need no
 * special case: a later `reasoning-delta` reopens the phase on its own.
 */
function endThinkingOnOutput(thinking: ThinkingSnapshot): ThinkingSnapshot {
  return thinking.status === "thinking" ? { ...thinking, status: "complete" } : thinking
}

function validateFinishedStream(hasFinish: boolean, finishReason: string | undefined): void {
  if (!hasFinish) {
    throw new BackgroundStreamError("stream_protocol_error", aiStreamProtocolErrorMessage)
  }

  if (finishReason === "length") {
    throw new BackgroundStreamError("output_validation_failed", aiOutputLengthLimitErrorMessage)
  }
}

async function consumeTextPartStream(
  partStream: AsyncIterable<unknown>,
  options: {
    onChunk?: StreamRuntimeOptions<BackgroundTextStreamSnapshot>["onChunk"]
    signal?: AbortSignal
  },
): Promise<BackgroundTextStreamSnapshot> {
  const { onChunk, signal } = options
  let cumulativeText = ""
  let thinking: ThinkingSnapshot = {
    status: "thinking",
    text: "",
  }
  let hasFinish = false
  let finishReason: string | undefined

  for await (const rawPart of partStream) {
    if (signal?.aborted) {
      throw new DOMException("stream aborted", "AbortError")
    }

    const part = toAiStreamPart(rawPart)
    switch (part.type) {
      case "text-delta": {
        cumulativeText += getStringPartField(part, "text")
        thinking = endThinkingOnOutput(thinking)
        onChunk?.(createStreamSnapshot(cumulativeText, thinking))
        break
      }
      case "reasoning-start": {
        thinking = {
          ...thinking,
          status: "thinking",
        }
        break
      }
      case "reasoning-delta": {
        thinking = {
          status: "thinking",
          text: thinking.text + getStringPartField(part, "text"),
        }
        onChunk?.(createStreamSnapshot(cumulativeText, thinking))
        break
      }
      case "reasoning-end": {
        thinking = {
          ...thinking,
          status: "complete",
        }
        onChunk?.(createStreamSnapshot(cumulativeText, thinking))
        break
      }
      case "reasoning-file": {
        break
      }
      case "finish": {
        hasFinish = true
        finishReason = getStreamFinishReason(part)
        break
      }
      case "error": {
        throw getStreamPartError(part)
      }
      default: {
        break
      }
    }
  }

  validateFinishedStream(hasFinish, finishReason)

  thinking = {
    ...thinking,
    status: "complete",
  }

  return createStreamSnapshot(cumulativeText, thinking)
}

async function consumeStructuredObjectPartStream<TOutput extends Record<string, unknown>>(
  partStream: AsyncIterable<unknown>,
  options: {
    objectSchema: z.ZodType<TOutput>
    onChunk?: StreamRuntimeOptions<BackgroundStructuredObjectStreamSnapshot>["onChunk"]
    signal?: AbortSignal
  },
): Promise<BackgroundStreamSnapshot<TOutput>> {
  const { objectSchema, onChunk, signal } = options
  let cumulativeText = ""
  let cumulativeValue: Record<string, unknown> = {}
  let thinking: ThinkingSnapshot = {
    status: "thinking",
    text: "",
  }
  let hasFinish = false
  let finishReason: string | undefined

  for await (const rawPart of partStream) {
    if (signal?.aborted) {
      throw new DOMException("stream aborted", "AbortError")
    }

    const part = toAiStreamPart(rawPart)
    switch (part.type) {
      case "text-delta": {
        cumulativeText += getStringPartField(part, "text")
        thinking = endThinkingOnOutput(thinking)
        const partial = await parsePartialJson(cumulativeText)
        if (isRecord(partial.value)) {
          cumulativeValue = { ...cumulativeValue, ...partial.value }
          onChunk?.(createStreamSnapshot(cumulativeValue, thinking))
        }
        break
      }
      case "reasoning-start": {
        thinking = {
          ...thinking,
          status: "thinking",
        }
        break
      }
      case "reasoning-delta": {
        thinking = {
          status: "thinking",
          text: thinking.text + getStringPartField(part, "text"),
        }
        onChunk?.(createStreamSnapshot(cumulativeValue, thinking))
        break
      }
      case "reasoning-end": {
        thinking = {
          ...thinking,
          status: "complete",
        }
        onChunk?.(createStreamSnapshot(cumulativeValue, thinking))
        break
      }
      case "reasoning-file": {
        break
      }
      case "finish": {
        hasFinish = true
        finishReason = getStreamFinishReason(part)
        break
      }
      case "error": {
        throw getStreamPartError(part)
      }
      default: {
        break
      }
    }
  }

  validateFinishedStream(hasFinish, finishReason)

  try {
    const finalJson = await parsePartialJson(cumulativeText)
    const finalValue = objectSchema.parse(finalJson.value)
    thinking = {
      ...thinking,
      status: "complete",
    }

    return createStreamSnapshot(finalValue, thinking)
  } catch (error) {
    throw new BackgroundStreamError("output_validation_failed", aiOutputValidationErrorMessage, {
      cause: error,
    })
  }
}

async function createLocalTextPartStream(
  input: BackgroundStreamTextSerializablePayload,
  options: StreamRuntimeOptions<BackgroundTextStreamSnapshot> = {},
): Promise<AsyncIterable<unknown>> {
  const payload = openAITextPayloadSchema.parse(input)
  const execution = await resolveOpenAIExecution(payload.providerConfig, {
    signal: options.signal,
    usageTask: payload.usageTask ?? "selection",
  })
  const result = streamText({
    model: execution.model,
    ...execution.params,
    instructions: payload.instructions,
    prompt: payload.prompt,
    maxOutputTokens: payload.maxOutputTokens,
    maxRetries: 0,
    abortSignal: options.signal,
    onError: ({ error }) => options.onError?.(error),
  })
  return result.stream
}

export async function generateTextForProviderRef(
  input: BackgroundGenerateTextPayload,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  const payload = openAIGeneratePayloadSchema.parse(input)
  const execution = await resolveOpenAIExecution(payload.providerRef.config, {
    ...options,
    usageTask: payload.usageTask ?? "summary",
  })
  const { text } = await generateText({
    model: execution.model,
    ...execution.params,
    instructions: payload.instructions,
    prompt: payload.prompt,
    maxRetries: 0,
    abortSignal: options.signal,
  })
  return text.trim()
}

export async function runStreamTextInBackground(
  input: BackgroundStreamTextSerializablePayload,
  options: StreamRuntimeOptions<BackgroundTextStreamSnapshot> = {},
): Promise<BackgroundTextStreamSnapshot> {
  options.signal?.throwIfAborted()
  const partStream = await createLocalTextPartStream(input, options)
  return consumeTextPartStream(partStream, { onChunk: options.onChunk, signal: options.signal })
}

export async function runImageTextInBackground(
  input: BackgroundStreamImageSerializablePayload,
  options: StreamRuntimeOptions<BackgroundTextStreamSnapshot> = {},
) {
  const result = await createImagePartStream(input, options)
  return consumeTextPartStream(result.stream, { onChunk: options.onChunk, signal: options.signal })
}

async function createImagePartStream(
  input: BackgroundStreamImageSerializablePayload,
  options: Pick<StreamRuntimeOptions, "signal" | "onError">,
  structured = false,
) {
  options.signal?.throwIfAborted()
  const payload = openAIImagePayloadSchema.parse(input)
  const execution = await resolveOpenAIExecution(payload.providerConfig, {
    signal: options.signal,
    usageTask: structured ? "image" : "ocr",
  })
  const result = streamText({
    model: execution.model,
    ...execution.params,
    instructions: payload.instructions,
    ...(structured ? { output: Output.object({ schema: imagePairWireSchema }) } : {}),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: payload.prompt },
          {
            type: "file",
            mediaType: payload.image.startsWith("data:image/png;") ? "image/png" : "image/jpeg",
            data: payload.image,
            providerOptions: { openai: { imageDetail: "high" } },
          },
        ],
      },
    ],
    maxOutputTokens: payload.maxOutputTokens,
    maxRetries: 0,
    abortSignal: options.signal,
    onError: ({ error }) => options.onError?.(error),
  })
  return result
}

export async function runImageTranslationInBackground(
  input: BackgroundStreamImageSerializablePayload,
  options: StreamRuntimeOptions<BackgroundStructuredObjectStreamSnapshot> = {},
) {
  const result = await createImagePartStream(input, options, true)
  return consumeStructuredObjectPartStream(result.stream, {
    objectSchema: imagePairSchema,
    onChunk: options.onChunk,
    signal: options.signal,
  })
}

async function createLocalStructuredObjectPartStream<TOutput extends Record<string, unknown>>(
  input: BackgroundStreamStructuredObjectSerializablePayload,
  objectSchema: z.ZodType<TOutput>,
  options: StreamRuntimeOptions<BackgroundStructuredObjectStreamSnapshot> = {},
): Promise<AsyncIterable<unknown>> {
  const payload = openAIStructuredPayloadSchema.parse(input)
  const execution = await resolveOpenAIExecution(payload.providerConfig, {
    signal: options.signal,
    usageTask: payload.usageTask ?? "customAction",
  })
  const result = streamText({
    model: execution.model,
    ...execution.params,
    instructions: payload.instructions,
    prompt: payload.prompt,
    maxOutputTokens: payload.maxOutputTokens,
    output: Output.object({ schema: objectSchema }),
    maxRetries: 0,
    abortSignal: options.signal,
    onError: ({ error }) => options.onError?.(error),
  })
  return result.stream
}

export async function runStructuredObjectStreamInBackground(
  input: BackgroundStreamStructuredObjectSerializablePayload,
  options: StreamRuntimeOptions<BackgroundStructuredObjectStreamSnapshot> = {},
): Promise<BackgroundStructuredObjectStreamSnapshot> {
  options.signal?.throwIfAborted()
  const payload = openAIStructuredPayloadSchema.parse(input)
  const objectSchema = createStructuredObjectSchema(payload.outputSchema)
  const partStream = await createLocalStructuredObjectPartStream(payload, objectSchema, options)
  return consumeStructuredObjectPartStream(partStream, {
    objectSchema,
    onChunk: options.onChunk,
    signal: options.signal,
  })
}

const parseStreamTextStartMessage =
  createStartMessageParser<BackgroundStreamTextSerializablePayload>(streamTextPayloadSchema)
const parseStructuredObjectStartMessage =
  createStartMessageParser<BackgroundStreamStructuredObjectSerializablePayload>(
    structuredObjectPayloadSchema,
  )
export const handleStreamTextPort = createStreamPortHandler<
  BackgroundStreamTextSerializablePayload,
  BackgroundTextStreamSnapshot
>(runStreamTextInBackground, parseStreamTextStartMessage)

export const handleStreamStructuredObjectPort = createStreamPortHandler<
  BackgroundStreamStructuredObjectSerializablePayload,
  BackgroundStructuredObjectStreamSnapshot
>(runStructuredObjectStreamInBackground, parseStructuredObjectStartMessage)

export const BACKGROUND_STREAM_PORT_HANDLERS: Readonly<
  Record<BackgroundStreamPortName, StreamPortHandler>
> = {
  [BACKGROUND_STREAM_PORTS.streamText]: handleStreamTextPort,
  [BACKGROUND_STREAM_PORTS.streamImageText]: (port) => {
    if (
      !isTrustedOptionsSender(
        port.sender,
        browser.runtime.id,
        new URL("image-translate.html", browser.runtime.getURL("/")).href,
      )
    ) {
      port.disconnect()
      return
    }
    createStreamPortHandler(
      runImageTextInBackground,
      createStartMessageParser<BackgroundStreamImageSerializablePayload>(openAIImagePayloadSchema),
    )(port)
  },
  [BACKGROUND_STREAM_PORTS.streamImageTranslation]: (port) => {
    if (
      !isTrustedOptionsSender(
        port.sender,
        browser.runtime.id,
        new URL("image-translate.html", browser.runtime.getURL("/")).href,
      )
    ) {
      port.disconnect()
      return
    }
    createStreamPortHandler(
      runImageTranslationInBackground,
      createStartMessageParser<BackgroundStreamImageSerializablePayload>(openAIImagePayloadSchema),
    )(port)
  },
  [BACKGROUND_STREAM_PORTS.streamStructuredObject]: handleStreamStructuredObjectPort,
}

export function dispatchBackgroundStreamPort(port: Browser.runtime.Port): boolean {
  const handler = BACKGROUND_STREAM_PORT_HANDLERS[port.name as BackgroundStreamPortName]
  if (!handler) {
    return false
  }

  handler(port)
  return true
}
