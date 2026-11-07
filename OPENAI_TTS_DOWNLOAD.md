# Tải MP3 từ OpenAI TTS

Tính năng riêng của fork từ package `1.58.0-a.19`, manifest numeric `1.58.0.20`,
hiển thị **1.58.0A**. Mở rộng hợp đồng **F09** trong
[FORK_DIFFERENCES.md](FORK_DIFFERENCES.md); không thêm migration hoặc định dạng dữ liệu.

## Cách dùng

Chọn **Text to Speech → Speech provider → OpenAI**, cấu hình model/giọng/tốc độ/
phong cách đọc như trước. Nút **Tải MP3** (biểu tượng tải xuống) nằm cạnh nút loa
trong bản dịch bôi đen web, kết quả dịch PDF/ảnh và Translation Hub; phần nghe thử
trong cài đặt cũng có nút có chữ. Trong kết quả từ điển/custom action, bấm loa ở
trường muốn đọc; nút tải bên dưới lưu chính trường vừa được chọn đọc.

Bấm tải để tạo **một file MP3 cho toàn bộ đoạn**, rồi chọn nơi lưu bằng hộp thoại
của trình duyệt. Không cần nghe trước. Tối đa 20.000 ký tự mỗi file; khi đang tạo
có thể bấm lại để hủy. Khi đã mở hộp thoại lưu, dùng Cancel trong hộp thoại.
Microsoft TTS tiếp tục hoạt động như trước và không hiện nút MP3 OpenAI.

Audio hoàn tất còn trong cache bộ nhớ của cùng trang được dùng lại theo chính
xác text/model/voice/speed/style/credential revision. Nếu lượt đọc đang tạo cùng
chunk, lượt tải chờ kết quả đó. Những đoạn chưa có cần gọi OpenAI và có thể tính
phí; không cam kết tải miễn phí sau khi đổi trang/đổi giọng/xóa cache. Tải không tự
phát audio, phát không tự tải file. Đóng khung/đổi nội dung hoặc cấu hình hủy phần
tạo file chưa lưu. File đã lưu do người dùng quản lý, không tự đưa vào sổ từ/sync.

## Hợp đồng cần giữ khi merge upstream

- Giữ model hiện được chọn. Speech API trả WAV; Realtime trả PCM 24 kHz được đóng
  WAV ở background. Chuyển sang MP3 mono 64 kbps trên máy bằng lamejs sẵn có,
  **một encoder xuyên suốt mọi chunk**. Không đổi đuôi WAV thành MP3, không nối
  nhiều WAV header, không tải thiếu những đoạn chưa phát. MP3 là nén có mất mát.
- `use-text-to-speech.tsx` và `use-openai-tts-download.ts` dùng chung
  `tts-playback/openai-audio-cache.ts`. Chia cùng ranh giới UTF-8 1.800 byte để
  khớp cache, không phụ thuộc playback đã chạy hết hay chưa.
- Cancellation vẫn có chủ riêng. Lượt tải dùng port `openai-tts-file` và
  `generateOpenAIAudio`, không gọi `ttsPlaybackPrepare/Stop`, không dùng
  `getTTSRequestSignal`. Hủy lượt chờ không hủy lượt tạo của speaker; speaker bị
  hủy thì lượt tải còn hoạt động có thể tạo tiếp độc lập. Không ảnh hưởng sinh
  audio từ vựng hoặc playback Microsoft/offscreen.
- Credential chỉ được đọc trong private background runtime hiện có. Port mới
  và RPC tải file kiểm tra extension sender ID. Kiểm tra key/revision trước tạo
  và trước lưu; phản hồi cũ không được lưu khi đổi text/config/key.
- Chỉ tải sau thao tác bấm nút. RPC `downloadOpenAITTSMp3` nhận base64 có giới
  hạn, kiểm tra toàn bộ MPEG Layer III frames, tên file cố định theo thời gian
  không có text được chọn, URL trang hoặc đường dẫn PDF. Dùng quyền `downloads`
  và `saveAs: true`; lỗi trả về không chứa data URI hoặc provider internals.
- Giới hạn tổng nguồn WAV 128 MiB, MP3 32 MiB; tổng hợp tuần tự, encoder nhường
  event loop và có abort checks. MP3 encoder được import khi bấm tải. Không thêm
  file audio/screenshots vào config, credential DB, PDF/image history hoặc sync.
- Parser WAV dùng chung có size budget tường minh cho file TTS; mặc định và
  đường nén vocabulary không đổi. Giữ nguyên DB/ZIP/report đã phát hành.

Source chính: `src/hooks/use-openai-tts-download.ts`,
`src/components/ui/selection-popover/download-tts-button.tsx`,
`src/utils/tts-playback/{openai-audio-cache,mp3-download}.ts`,
`src/entrypoints/background/{openai-tts,tts-download,index}.ts`.

## Kiểm thử

Unit/integration: toàn đoạn nhiều chunk phải cho cùng MP3 như một WAV liên tục;
input hỏng/mixed-rate/cancel; pending/completed cache và mọi trường invalidation;
sender/MP3 validation/filename/saveAs/cancel lỗi; không gọi API khi mount;
Microsoft không hiện nút; thiếu/đổi key, đổi text/voice/unmount, chống bấm kép;
giữ regression playback supersede và vocabulary audio.

Browser regression: `node scripts/debug/check-tts-download.mjs` trên build
`pnpm zip:edge`, profile Edge mới với private sentinel và provider giả lập.
Luồng Speech WAV và Realtime PCM phải tải file thật, decoder độc lập kiểm tra
duration đủ mọi chunk. Fixture chỉ bỏ native Save picker trong profile thử;
unit test xác nhận production luôn yêu cầu `saveAs: true`. API/model thật, giọng
thật và thao tác hộp thoại OS cần ghi riêng, không suy ra từ fixture.

Tham khảo định dạng API: [OpenAI Text to Speech](https://developers.openai.com/api/docs/guides/text-to-speech),
[Realtime events](https://developers.openai.com/api/reference/resources/realtime/server-events).

### Kết quả ngày 07/11/2026

- Đã sửa: nút tải tại các vị trí nêu trên, cache/pending reuse, ghép MP3 và hủy
  độc lập; quyền tải file, phiên bản package/manifest và tài liệu merge F09.
- Đã kiểm thử: **4.221 unit/integration đạt, 1 live-service test bỏ qua** với
  `SKIP_FREE_API=true`; lint/typecheck; build ZIP. **11 Edge assertions đạt**
  trên `Edg/156.0.4314.58`, bằng chứng tại
  `.codex/tts-download-1794036290362/evidence.json` (local, không commit profile).
  Hai file một chunk dài 1,056 giây; file ba chunk dài 3,048 giây qua ffprobe,
  thay cho nguồn fixture 1 và 3 giây (có MP3 encoder padding).
- Chưa kiểm thử: API OpenAI/giọng thật và hộp thoại Save của hệ điều hành; fixture
  dùng profile mới và API giả lập, CDP lưu file theo GUID để tránh ghi đè.
- Bị chặn: không có. Các giới hạn 20.000 ký tự/128 MiB WAV/32 MiB MP3 là chủ ý.

ZIP mới có 433 file, 8.929.229 byte (so với LearningWindow 8.749.374 byte,
tăng khoảng 176 KiB). HTML ôn từ vẫn tự chứa; parser audio dùng chung thêm budget
tường minh nên artifact HTML thay đổi 10 byte, không đổi DB/ZIP/report hoặc logic
ôn tập. Không diễn giải kích thước ZIP thành mức sử dụng RAM hoặc tốc độ API.
