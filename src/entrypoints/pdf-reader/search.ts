export type PdfSearchOptions = {
  caseSensitive: boolean
  wholeWord: boolean
  ignoreAccents: boolean
  mode: "phrase" | "all" | "any"
  wildcards: boolean
  ignoreSpaces: boolean
  near: number
}
export const DEFAULT_PDF_SEARCH: PdfSearchOptions = {
  caseSensitive: false,
  wholeWord: false,
  ignoreAccents: false,
  mode: "phrase",
  wildcards: true,
  ignoreSpaces: false,
  near: 0,
}
export function foldPdfSearch(text: string, options: PdfSearchOptions) {
  let value = text.normalize("NFC").replace(/\s+/gu, " ")
  if (!options.caseSensitive) value = value.toLocaleLowerCase()
  if (options.ignoreAccents)
    value = value.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gu, "d").replace(/Đ/gu, "D")
  return options.ignoreSpaces ? value.replace(/\s/gu, "") : value
}
const word = (char: string | undefined) => !!char && /[\p{L}\p{N}\p{M}_$]/u.test(char)
export function compileAdvancedPdfSearch(
  query: string,
  options: PdfSearchOptions = DEFAULT_PDF_SEARCH,
) {
  const normalized = foldPdfSearch(query.trim(), options)
  if (normalized.length > 200) throw new Error("Từ khóa tối đa 200 ký tự.")
  const terms =
    options.mode === "phrase"
      ? [normalized]
      : [
          ...new Set(
            query
              .trim()
              .split(/\s+/u)
              .filter(Boolean)
              .map((t) => foldPdfSearch(t, options)),
          ),
        ]
  if (terms.length > 32) throw new Error("Mỗi lượt tối đa 32 từ tìm kiếm.")
  const fragments = terms.map((term) =>
    (options.wildcards ? term.split("*") : [term]).filter(Boolean),
  )
  return (
    source: string,
    accept?: (match: { start: number; end: number }) => boolean,
  ): { start: number; end: number }[] => {
    const groups = fragments.map((parts) => {
      const found: { start: number; end: number }[] = []
      if (!parts.length) return found
      let cursor = 0
      while (found.length < 100) {
        const start = source.indexOf(parts[0]!, cursor)
        if (start < 0) break
        let end = start + parts[0]!.length,
          missing = false
        for (const part of parts.slice(1)) {
          const at = source.indexOf(part, end)
          if (at < 0) {
            missing = true
            break
          }
          end = at + part.length
        }
        if (missing) break
        cursor = Math.max(start + 1, end)
        if (
          accept
            ? accept({ start, end })
            : !options.wholeWord || (!word(source[start - 1]) && !word(source[end]))
        )
          found.push({ start, end })
      }
      return found
    })
    if (options.mode === "all" && groups.some((group) => !group.length)) return []
    const unique = new Map<string, { start: number; end: number }>()
    if (options.mode === "all" && options.near > 0 && groups.length > 1) {
      const tagged = groups
        .flatMap((g, term) => g.map((m) => ({ ...m, term })))
        .sort((a, b) => a.start - b.start || a.end - b.end)
      const counts = Array.from({ length: groups.length }, () => 0)
      let covered = 0,
        left = 0
      for (let right = 0; right < tagged.length && unique.size < 100; right++) {
        const item = tagged[right]!
        if (counts[item.term] === 0) covered++
        counts[item.term] = (counts[item.term] ?? 0) + 1
        while (covered === groups.length && left <= right) {
          const window = tagged.slice(left, right + 1)
          if (Math.max(...window.map((m) => m.end)) - tagged[left]!.start <= options.near)
            for (const m of window)
              unique.set(`${m.start}:${m.end}`, { start: m.start, end: m.end })
          const term = tagged[left]!.term
          counts[term] = (counts[term] ?? 0) - 1
          if (counts[term] === 0) covered--
          left++
        }
      }
    } else for (const match of groups.flat()) unique.set(`${match.start}:${match.end}`, match)
    return [...unique.values()].sort((a, b) => a.start - b.start || a.end - b.end).slice(0, 100)
  }
}
export function createPdfSourceMatcher(
  query: string,
  options: PdfSearchOptions = DEFAULT_PDF_SEARCH,
) {
  const match = compileAdvancedPdfSearch(query, options)
  return (source: string) => {
    if (source.length > 200000)
      throw new Error("Trang vượt giới hạn chữ tìm kiếm; thu hẹp phạm vi trang.")
    if (!options.ignoreSpaces && /^[\x20-\x7e]*$/u.test(source) && !/ {2}/u.test(source))
      return match(options.caseSensitive ? source : source.toLowerCase())
    let folded = ""
    const starts: number[] = [],
      ends: number[] = []
    for (const { segment, index } of new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    }).segment(source)) {
      for (const char of foldPdfSearch(segment, options)) {
        if (char === " " && folded.endsWith(" ")) continue
        folded += char
        for (let i = 0; i < char.length; i++) {
          starts.push(index)
          ends.push(index + segment.length)
        }
      }
    }
    return match(
      folded,
      (m) =>
        !options.wholeWord ||
        (!word(source[starts[m.start]! - 1]) && !word(source[ends[m.end - 1]!])),
    ).map((m) => ({ start: starts[m.start]!, end: ends[m.end - 1]! }))
  }
}
