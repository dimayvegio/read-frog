export interface PdfTextOptions {
  clean: boolean
  joinHyphenatedWords: boolean
}
export const DEFAULT_PDF_TEXT_OPTIONS: PdfTextOptions = { clean: true, joinHyphenatedWords: false }

// A text selection has no coordinates. Never guess column order or flatten
// tables/lists. Hard hyphens may be real (well-known), so removal is opt-in.
export function preparePdfText(raw: string, options: PdfTextOptions): string {
  if (!options.clean) return raw
  let text = raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/(?<=\p{L})\u00ad[ \t]*\n[ \t]*(?=\p{L})/gu, "")
    .replace(/\u00ad/g, "")
  if (options.joinHyphenatedWords) text = text.replace(/(?<=\p{L})-[ \t]*\n[ \t]*(?=\p{Ll})/gu, "")
  const lines = text.split("\n"),
    result: string[] = []
  const protectedLine = (line: string) =>
    /\t|\S {2,}\S|^ {4}|^\s*(?:[-*•▪◦]|\d+[.)]|[A-Za-z][.)])\s|[=<>±∑√]|^\s*```/u.test(line) ||
    /^\p{Lu}[\p{Lu}\p{N}\s:–—-]+$/u.test(line.trim())
  let fenced = false,
    previousFenced = false
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!,
      previous = lines[index - 1]
    const inFence = fenced || /^\s*```/.test(line)
    if (/^\s*```/.test(line)) fenced = !fenced
    if (index === 0) {
      result.push(line)
      continue
    }
    if (
      !line.trim() ||
      !previous?.trim() ||
      inFence ||
      previousFenced ||
      protectedLine(line) ||
      protectedLine(previous)
    )
      result.push("\n", line)
    else
      result.push(
        /\p{L}-$/u.test(previous.trimEnd()) && /^\p{Ll}/u.test(line.trimStart()) ? "" : " ",
        line.trim(),
      )
    previousFenced = inFence
  }
  return result
    .join("")
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n")
    .trim()
}
