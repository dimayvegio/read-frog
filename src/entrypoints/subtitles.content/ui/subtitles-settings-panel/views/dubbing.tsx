import { useDubbing } from "../../dubbing-context"
/** Light context only: views are imported by atoms before the runtime is initialized. */
export function DubbingView() {
  const dub = useDubbing()
  if (!dub) return null
  return (
    <div className="space-y-3 p-3 text-xs" data-dubbing-view>
      <label className="block space-y-1">
        <span>Giọng đọc từ phụ đề</span>
        <select
          aria-label="Lời lồng tiếng"
          className="w-full rounded border border-border bg-background p-2 text-foreground"
          value={dub.mode}
          onChange={(e) =>
            dub.changeMode(e.target.value === "original" ? "original" : "translated")
          }
        >
          <option value="translated">Lời dịch</option>
          <option value="original">Lời gốc</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span>Âm lượng gốc khi đọc: {Math.round(dub.duck * 100)}%</span>
        <input
          aria-label="Âm lượng gốc khi lồng tiếng"
          className="w-full"
          type="range"
          min="0"
          max="100"
          step="5"
          value={dub.duck * 100}
          onChange={(e) => dub.changeDuck(Number(e.target.value) / 100)}
        />
      </label>
      <p className="text-muted-foreground">
        Giọng AI OpenAI · {dub.model} · {dub.voice}
      </p>
      <p className="text-muted-foreground">
        Đệm tối đa 30 giây / 6 câu. Video có thể tạm dừng chờ giọng đọc; tua sẽ bỏ câu cũ. Có tính
        phí tạo giọng OpenAI.
      </p>
      <p className="text-muted-foreground">
        Lời dịch dùng kết quả phụ đề hiện tại. Cần CC gốc (ani.pm: SOFT + English). Không tự nhận
        dạng âm thanh khi thiếu CC.
      </p>
      <button
        type="button"
        data-dubbing-toggle
        className="w-full rounded bg-primary p-2 font-medium text-primary-foreground"
        onClick={dub.state.active ? dub.stop : dub.start}
      >
        {dub.state.active ? "Tắt lồng tiếng" : "Bắt đầu lồng tiếng"}
      </button>
      <p role="status" data-dubbing-status>
        {dub.state.message}
      </p>
    </div>
  )
}
