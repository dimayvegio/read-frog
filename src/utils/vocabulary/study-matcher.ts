import type { StudyWord } from "./study-snapshot"
export const STUDY_LABELS = {
  needsReview: "Cần ôn",
  developing: "Đang củng cố",
  recallSignals: "Có dấu hiệu nhớ",
  notAssessed: "Chưa đủ dữ liệu",
} as const
const priority = { needsReview: 0, developing: 1, notAssessed: 2, recallSignals: 3 }
function variantKey(value: string) {
  return value.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ").replace(/[’‘]/g, "'")
}
export function createStudyMatcher(words: readonly StudyWord[]) {
  const byVariant = new Map<string, StudyWord[]>()
  for (const word of words)
    for (const raw of word.variants) {
      const value = variantKey(raw)
      if (!value || value.length > 160) continue
      const list = byVariant.get(value) ?? []
      if (!list.some((row) => row.id === word.id)) list.push(word)
      byVariant.set(value, list)
    }
  const pattern = [...byVariant.keys()]
    .sort((a, b) => b.length - a.length)
    .map((value) =>
      value
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\s+/g, "\\s+")
        .replace(/'/g, "['’‘]"),
    )
  const regex = pattern.length ? new RegExp(pattern.join("|"), "giu") : null
  return (text: string, max = 100) => {
    if (!regex) return []
    regex.lastIndex = 0
    const matches: {
      start: number
      end: number
      words: StudyWord[]
      status: StudyWord["status"]
    }[] = []
    for (const match of text.matchAll(regex)) {
      const start = match.index,
        end = start + match[0].length
      if (
        (start && /[\p{L}\p{N}_]/u.test(text[start - 1]!)) ||
        (end < text.length && /[\p{L}\p{N}_]/u.test(text[end]!)) ||
        (start > 1 && /['’‘]/u.test(text[start - 1]!) && /[\p{L}\p{N}_]/u.test(text[start - 2]!)) ||
        (end + 1 < text.length &&
          /['’‘]/u.test(text[end]!) &&
          /[\p{L}\p{N}_]/u.test(text[end + 1]!))
      )
        continue
      const found = byVariant.get(variantKey(match[0]))
      if (!found) continue
      const status = [...found].sort((a, b) => priority[a.status] - priority[b.status])[0]!.status
      matches.push({ start, end, words: found, status })
      if (matches.length >= max) break
    }
    return matches
  }
}
