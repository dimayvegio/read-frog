/** Ordered, deduplicated page selection; never silently truncate a range. */
export function parsePdfPages(input: string, total: number): number[] {
  if (!Number.isSafeInteger(total) || total < 1 || input.length > 4000)
    throw new Error("Danh sách trang không hợp lệ.")
  const tokens = input
    .trim()
    .replace(/[–—]/gu, "-")
    .split(/[,;\s]+/u)
    .filter(Boolean)
  if (!tokens.length) throw new Error("Nhập trang, ví dụ 1-10, 30-35, 42.")
  const pages = new Set<number>()
  for (const token of tokens) {
    const match = /^(\d+)(?:-(\d+))?$/u.exec(token)
    if (!match) throw new Error(`Khoảng trang không hợp lệ: ${token}`)
    const first = Number(match[1]),
      last = Number(match[2] ?? match[1])
    if (!Number.isSafeInteger(first) || first < 1 || last < first || last > total)
      throw new Error(`Trang phải nằm trong 1–${total}, từ nhỏ đến lớn.`)
    if (last - first + 1 > 2000) throw new Error("Mỗi tài liệu mới tối đa 2.000 trang.")
    for (let page = first; page <= last; page++) {
      pages.add(page)
      if (pages.size > 2000) throw new Error("Mỗi tài liệu mới tối đa 2.000 trang.")
    }
  }
  return [...pages]
}
