import { useDubbing } from "../../dubbing-context"
import { useSmartVideo } from "../../smart-video-context"
export function SmartVideoView() {
  const smart = useSmartVideo(),
    dub = useDubbing()
  if (!smart) return null
  return (
    <div className="space-y-3 p-3 text-xs" data-smart-video-view>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          aria-label="AI phân tích phụ đề và nhiều giọng"
          checked={smart.enabled}
          onChange={(e) => {
            dub?.stop()
            smart.setEnabled(e.target.checked)
          }}
        />
        AI tối ưu phụ đề và nhiều giọng
      </label>
      <p className="text-muted-foreground">
        Nghe audio thật và đọc CC để tóm tắt, hỗ trợ dịch theo ngữ cảnh, chọn giọng/tốc độ/cách thể
        hiện cho từng người nói. Giọng nam tính/nữ tính chỉ là cảm nhận âm thanh, không phải kết
        luận giới tính. Không nhân bản hay xác định danh tính.
      </p>
      {smart.enabled && (
        <>
          <p>
            Phân tích: gpt-audio-1.5 · có tính phí OpenAI. Chuẩn bị trước tối đa 30 phút / 8 MiB.
            Thu từ player mất bằng thời lượng video, sẽ quay về vị trí cũ và tạm dừng khi xong. Có
            thể chọn MP3/WAV cùng video để bỏ bước thu.
          </p>
          <input
            type="file"
            accept=".mp3,.wav,audio/mpeg,audio/wav"
            aria-label="Audio cùng video để phân tích"
            disabled={smart.busy}
            onChange={(e) => smart.chooseFile(e.target.files?.[0] ?? null)}
            className="w-full"
          />
          <button
            type="button"
            data-smart-prepare
            disabled={smart.busy}
            onClick={() => {
              dub?.stop()
              void smart.prepare()
            }}
            className="w-full rounded bg-primary p-2 text-primary-foreground"
          >
            Chuẩn bị và phân tích audio
          </button>
          {smart.busy && (
            <button type="button" onClick={smart.cancel}>
              Hủy chuẩn bị
            </button>
          )}
          {smart.profile && (
            <>
              <p>{smart.profile.summary}</p>
              {smart.profile.speakers.map((s, i) => (
                <div key={s.id} className="rounded border border-border p-2">
                  Người nói {i + 1} · {s.voice} · {s.speed}×<p>{s.description}</p>
                </div>
              ))}
            </>
          )}
        </>
      )}
      <p role="status" data-smart-status>
        {smart.status}
      </p>
    </div>
  )
}
