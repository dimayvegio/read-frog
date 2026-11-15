/** Validate a bounded base64 envelope without retaining a second full binary audio string. */
export function validSmartAudio(audio: string, format: "mp3" | "wav", limit: number) {
  if (
    !audio.length ||
    audio.length % 4 !== 0 ||
    audio.length > Math.ceil(limit / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/u.test(audio)
  )
    return false
  const padding = audio.endsWith("==") ? 2 : audio.endsWith("=") ? 1 : 0
  const bytes = (audio.length / 4) * 3 - padding
  if (bytes < 12 || bytes > limit) return false
  const head = atob(audio.slice(0, 16))
  return format === "wav"
    ? head.startsWith("RIFF") && head.slice(8, 12) === "WAVE"
    : head.startsWith("ID3") || (head.charCodeAt(0) === 255 && (head.charCodeAt(1) & 224) === 224)
}
