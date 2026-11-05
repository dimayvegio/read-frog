import type {
  BackgroundGenerateTextPayload,
  BackgroundGenerateTextResponse,
} from "@/types/background-generate-text"
import { openAIGeneratePayloadSchema } from "@/types/openai-execution"
import { safeOpenAIErrorMessage } from "@/utils/error/openai"
import { onMessage } from "@/utils/message"
import { generateTextForProviderRef } from "./background-stream"

export async function runGenerateTextInBackground(
  payload: BackgroundGenerateTextPayload,
): Promise<BackgroundGenerateTextResponse> {
  return { text: await generateTextForProviderRef(openAIGeneratePayloadSchema.parse(payload)) }
}

export function setupLLMGenerateTextMessageHandlers() {
  onMessage("backgroundGenerateText", async (message) => {
    try {
      return await runGenerateTextInBackground(message.data)
    } catch (error) {
      // oxlint-disable-next-line unicorn/preserve-caught-error -- SDK causes can include credentials and must not cross this message boundary.
      throw new Error(safeOpenAIErrorMessage(error))
    }
  })
}
