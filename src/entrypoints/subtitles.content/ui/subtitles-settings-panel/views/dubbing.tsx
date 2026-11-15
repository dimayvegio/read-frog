import { useDubbing } from "../../dubbing-context"
import { useSmartVideo } from "../../smart-video-context"
/** Light context only: views are imported by atoms before the runtime is initialized. */
export function DubbingView() {
  const dub = useDubbing()
  const smart = useSmartVideo()
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
        <span>Âm gốc khi có lời thoại: {Math.round(dub.duck * 100)}%</span>
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
      <label className="block space-y-1">
        <span>Âm lượng thuyết minh: {Math.round(dub.volume * 100)}%</span>
        <input
          aria-label="Âm lượng thuyết minh"
          type="range"
          min="0"
          max="150"
          step="5"
          value={dub.volume * 100}
          onChange={(e) => dub.changeVolume(Number(e.target.value) / 100)}
          className="w-full"
        />
      </label>
      <div className="space-y-1">
        <span>Giọng sớm / trễ: {(dub.offsetMs / 1000).toFixed(1)} giây</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Giọng sớm hơn 0,1 giây"
            onClick={() => dub.changeOffset(dub.offsetMs - 100)}
            className="rounded border px-3 py-1"
          >
            −
          </button>
          <input
            aria-label="Độ lệch giọng đọc"
            className="min-w-0 flex-1"
            type="range"
            min="-5000"
            max="5000"
            step="100"
            value={dub.offsetMs}
            onChange={(e) => dub.changeOffset(Number(e.target.value))}
          />
          <button
            type="button"
            aria-label="Giọng trễ hơn 0,1 giây"
            onClick={() => dub.changeOffset(dub.offsetMs + 100)}
            className="rounded border px-3 py-1"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => dub.changeOffset(0)}
            className="rounded border px-2 py-1"
          >
            Đặt lại
          </button>
        </div>
        <p className="text-muted-foreground">
          − đọc sớm hơn · + đọc trễ hơn. Chỉnh trực tiếp, dùng lại audio đã đệm. Âm lượng trên 100%
          được giới hạn để tránh rè.
        </p>
      </div>
      <p className="text-muted-foreground">
        Ưu tiên thuyết minh: giữ âm gốc thấp đến hết cả câu CC và giọng đọc, rồi tăng lại từ từ.
        Khoảng nghỉ ngắn giữa câu vẫn giữ thấp.
      </p>
      {smart?.enabled && (
        <p role="status">
          AI:{" "}
          {smart.profile
            ? `${smart.profile.speakers.length} giọng riêng theo người nói`
            : smart.status}
        </p>
      )}
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
