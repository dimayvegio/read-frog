export const ANALYSIS_DURATIONS = [15, 30, 60, 120, 300, 600] as const
export function analysisDuration(value: number) {
  if (!ANALYSIS_DURATIONS.some((seconds) => seconds === value))
    throw new Error("Chọn thời lượng phân tích từ 15 giây đến 10 phút.")
  return value
}
