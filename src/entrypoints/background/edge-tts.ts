import { onMessage } from "@/utils/message"
/** Retain old message contracts, with no Microsoft client in the production graph. */
export function setupEdgeTTSMessageHandlers() {
  const error = {
    code: "NETWORK_ERROR" as const,
    message: "Microsoft speech is disabled. This build uses OpenAI speech only.",
  }
  onMessage("edgeTtsSynthesize", async () => ({ ok: false as const, error }))
  onMessage("edgeTtsListVoices", async () => {
    throw new Error(error.message)
  })
  onMessage("edgeTtsHealthCheck", async () => {
    throw new Error(error.message)
  })
}
