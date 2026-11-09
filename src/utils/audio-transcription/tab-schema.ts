import { z } from "zod"
import { languageCode, MAX_TRANSCRIPT } from "./schema"

export const LIVE_TRANSCRIPTION_MODEL = "gpt-live-transcribe"
export const tabOptions = z.strictObject({
  mode: z.enum(["live", "record"]),
  languages: z.array(languageCode).max(16),
  prompt: z.string().trim().max(1000),
})
export type TabOptions = z.infer<typeof tabOptions>
export const tabCommand = z.discriminatedUnion("command", [
  z.strictObject({ command: z.literal("start"), channel: z.string().uuid(), ...tabOptions.shape }),
  z.strictObject({ command: z.enum(["stop", "cancel"]), session: z.string().uuid() }),
  z.strictObject({
    command: z.literal("release"),
    session: z.string().uuid(),
    url: z.string().max(200),
  }),
])
export type TabCommand = z.infer<typeof tabCommand>
export type TabNotice =
  | { type: "started"; session: string }
  | { type: "text"; session: string; text: string; pending: string }
  | { type: "recording"; session: string; url: string; size: number }
  | { type: "stopped"; session: string; message: string; partial: boolean }

/** Final completions may arrive out of order. Committed links establish audio order. */
export class LiveTranscript {
  private items = new Map<
    string,
    { previous: string | null; text: string; done: boolean; linked: boolean }
  >()
  private total = 0
  update(event: Record<string, unknown>) {
    if (
      ![
        "input_audio_buffer.committed",
        "conversation.item.input_audio_transcription.delta",
        "conversation.item.input_audio_transcription.completed",
      ].includes(String(event.type))
    )
      return null
    const id = event.item_id
    if (typeof id !== "string" || id.length > 200) return null
    let item = this.items.get(id)
    if (!item) {
      if (this.items.size >= 2000)
        throw new Error("Đã đạt giới hạn 2.000 lượt nói. Hãy tải TXT rồi mở lượt mới.")
      item = { previous: null, text: "", done: false, linked: false }
      this.items.set(id, item)
    }
    if (event.type === "input_audio_buffer.committed") {
      if (event.previous_item_id !== null && typeof event.previous_item_id !== "string") return null
      item.previous = event.previous_item_id
      item.linked = true
    } else if (
      event.type === "conversation.item.input_audio_transcription.delta" &&
      typeof event.delta === "string" &&
      !item.done
    ) {
      this.total += event.delta.length
      item.text += event.delta
    } else if (
      event.type === "conversation.item.input_audio_transcription.completed" &&
      typeof event.transcript === "string"
    ) {
      this.total += event.transcript.length - item.text.length
      item.text = event.transcript
      item.done = true
    } else return null
    if (this.total > MAX_TRANSCRIPT)
      throw new Error("Bản chép lời đã đạt giới hạn. Hãy tải TXT rồi mở lượt mới.")
    const ordered: (typeof item)[] = [],
      visited = new Set<string>(),
      following = new Map<string | null, [string, typeof item]>()
    for (const [key, value] of this.items)
      if (value.linked) following.set(value.previous, [key, value])
    let previous: string | null = null
    while (true) {
      const next = following.get(previous)
      if (!next || visited.has(next[0])) break
      visited.add(next[0])
      ordered.push(next[1])
      previous = next[0]
    }
    // Unlinked results remain provisional until their commit arrives.
    const text = ordered
      .filter((v) => v.done)
      .map((v) => v.text)
      .filter(Boolean)
      .join("\n\n")
    const pending = [...this.items]
      .filter(([key, v]) => !visited.has(key) || !v.done)
      .map(([, v]) => v.text)
      .filter(Boolean)
      .join("\n")
    return { text, pending }
  }
}
