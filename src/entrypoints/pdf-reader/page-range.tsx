export function readPageRange(
  from: string,
  to: string,
  total: number,
  limit = total,
  fallback = 1,
) {
  const first = from.trim() ? Number(from) : fallback,
    last = to.trim() ? Number(to) : first
  if (
    !Number.isInteger(first) ||
    !Number.isInteger(last) ||
    first < 1 ||
    last < first ||
    last > total ||
    last - first + 1 > limit
  )
    throw new Error(
      `Nhập trang hợp lệ từ 1 đến ${total}, bắt đầu không lớn hơn kết thúc${limit < total ? `; tối đa ${limit} trang/lượt` : ""}.`,
    )
  return { first, last }
}
export function PdfPageRange({
  from,
  to,
  onFrom,
  onTo,
  total,
  disabled = false,
  prefix,
}: {
  from: string
  to: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
  total: number
  disabled?: boolean
  prefix: string
}) {
  return (
    <div className="rf-page-range">
      <label>
        Từ trang
        <input
          type="number"
          min={1}
          max={total}
          placeholder="Hiện tại"
          aria-label={`${prefix} từ trang`}
          value={from}
          disabled={disabled}
          onChange={(e) => onFrom(e.target.value)}
        />
      </label>
      <label>
        Đến trang
        <input
          type="number"
          min={1}
          max={total}
          placeholder="Cùng trang"
          aria-label={`${prefix} đến trang`}
          value={to}
          disabled={disabled}
          onChange={(e) => onTo(e.target.value)}
        />
      </label>
    </div>
  )
}
