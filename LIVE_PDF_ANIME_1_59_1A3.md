# Read Frog 1.59.1A — bản sửa a.3

Baseline local `6369a966`, upstream vẫn `v1.59.1` / `56d05e33`.
Package `1.59.1-a.3`, manifest `1.59.1.3`, hiển thị **1.59.1A**.
Không đổi permissions, extension identity, config125, migrations, DB/ZIP/report/sync formats.

## Audio live và dịch theo ngữ cảnh

Luồng vẫn là tab audio → ASR delta/final → dịch **chỉ final** → khung nguồn.
Không tạo ASR/capture khác, không đổi model đang chọn, không gửi microphone.

- ASR `gpt-live-transcribe` đặt rõ `audio.input.transcription.delay = low`,
  thay vì để service tự chọn. Giữ `turn_detection: null` và local audio-clock gate.
- Cả khung nguồn và fallback Audio đều chốt giọng nói liên tục tối đa6s;
  fallback cũ15s. Khoảng yên lặng sau lời nói500ms thay900ms. Silence ban đầu
  không tạo câu; mỗi6s buffer không có giọng được clear. Không dựa timer của tab UI.
- Riêng dịch live, recommendation ngầm medium/high hạ xuống low. Giữ nguyên model
  và mọi reasoning đã chọn rõ (`provider-default`, high, none, v.v.); không sửa
  config đã lưu, không đổi dịch web/PDF/native CC. Prompt/cache identity tăng
  `live-context-v2-low-latency`.
- Tối đa hai job. Khi toàn bộ rows của job đã rời vùng24rows/16.000ký tự,
  hủy job đó để giải phóng slot cho lời mới. Không retry đoạn bị bỏ; lỗi provider
  thật vẫn pause và yêu cầu người dùng thử lại. Các guard source/target/config/key
  và RAM-only cache vẫn giữ nguyên. Không hiển thị bản dịch của nháp ASR.

Đây là các điểm chờ xác minh được từ code/thử nghiệm, **chưa chứng minh toàn bộ
nguyên nhân phiên thật của người dùng**. Nhánh PDF a.2 không thay F23 runtime.
Không có trace mạng/key/profile thật để quy độ chậm cho một lần merge hoặc OpenAI.

Theo [OpenAI Docs — realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription),
delay thấp ưu tiên latency và có thể ảnh hưởng chất lượng; số mili giây phụ thuộc
audio/model/service. [Reasoning](https://developers.openai.com/api/docs/guides/reasoning)
cũng có tradeoff tốc độ/chất lượng. Phải thử thêm lời nói thật, nhạc nền và đổi ngôn ngữ.

## Hình PDF

- Vuông lấy **trục kéo dài hơn**, nên kéo ngang/dọc vẫn ra hình vuông;
  chặn cạnh tại biên trang trước khi tạo points. Elip/Shift-circle/chữ nhật giữ như a.2.
- Bấm vào nét hình ngay ở Chọn chữ hoặc công cụ vẽ để chọn; không cần đổi mode.
  Hit area chỉ quanh nét, không phủ cả vùng chữ bên trong khi chưa chọn.
- Hình đã chọn có tám tay nắm resize, kéo thân để di chuyển, bảng bốn màu,
  nút Xóa và bỏ chọn. Delete/Backspace xóa khi focus hình, Ctrl+Z hoàn tác.
  Bấm ngoài/Esc bỏ chọn. Kích thước/di chuyển/màu/xóa giữ ID và mỗi thao tác ghi
  một revision/undo; pointer preview không chờ IndexedDB. Không có provider call.
- Giữ transactional conflicts, giới hạn tọa độ, cancel khi gesture bị ngắt,
  source text/canvas DOM, native selection và bilingual paragraph picking.
  Hình cũ vẫn là ink paths trong Study DB1; không migration hay đổi export.

## Ngữ cảnh ani.pm

Logo Read Frog → **Ngữ cảnh anime** → nhập tối đa1.000ký tự: tên anime,
nhân vật, quan hệ/xưng hô, thuật ngữ hoặc chủ đề → **Áp dụng ngữ cảnh**.
Nếu dịch đang bật, nút ghi **Áp dụng và dịch lại**, có nhắc phí khi dịch lại bộ đệm.

Nội dung ở RAM của adapter/tab, gắn nguồn video hiện tại; đổi nguồn, reload/đóng
tab thì bỏ. Không sync, không lưu notebook/settings và không tự lấy metadata
riêng của top page. Mở menu, gõ hoặc áp dụng cùng nội dung không gọi OpenAI.
Áp dụng khi OFF chỉ giữ local; bật phụ đề sau đó dùng context. Khi ON, Apply
vô hiệu coordinator cũ và explicit restart, không gán kết quả cũ vào ngữ cảnh mới.

Prompt coi context là dữ liệu trích dẫn, chỉ dùng cho tên/xưng hô/thuật ngữ,
không tự thêm lời thoại. Context ảnh hưởng cache key riêng; title/description/summary
upstream vẫn không vào stable cache key. Tải phụ đề dịch dùng cùng context/key.
Native CC, track mode thụ động Settlar, iframe guard, hai phút buffer, YouTube/
X/Netflix và Learning giữ nguyên. Không có call AI riêng để phân tích context.

## Kiểm chứng

Chrome157.0.8103.40, production build, profile riêng. Ba cặp chạy tuần tự,
cùng oscillator/tab capture/WebRTC local và ép source-pane unavailable:

| Đo local turn đầu | a.2                       | a.3                    |
| ----------------- | ------------------------- | ---------------------- |
| Ba mẫu (ms)       | 15000,9 /15001,7 /15005,0 | 6012,7 /6001,1 /6001,3 |
| Median            | **15001,7ms**             | **6001,3ms**           |

Giảm60,0% **riêng phần chờ chốt local của fallback**, không phải tốc độ dịch
end-to-end. Khi khung nguồn đã hoạt động, hard cap vẫn6s; khoảng nghỉ giọng đổi
900→500ms và ASR/reasoning mới ưu tiên latency. Không có phép đo OpenAI live.
Ngắt ngắn hơn có thể tăng số lượt dịch/context overhead; cần xem chất lượng và
usage trên lời nói thật. Không có benchmark RAM mới trong đợt a.3.

Đã kiểm thử: **4.533 unit pass,1 intentionally skipped**, type-aware lint và
production build. Browser: **63 audio**, **34 PDF UX**, **29 PDF tools/OCR**,
**33 PDF bilingual**, **80 PDF/selection/image** và **10 ani.pm context** checks.
Harness và giới hạn:

- `check-audio-transcription.mjs`: real tab capture + WebRTC local, ASR/text API mock;
  `AUDIO_LATENCY_BENCH=1` và `AUDIO_LATENCY_FALLBACK=1` so local commit cap,
  `AUDIO_EXTENSION=<artifact>` chọn baseline. Không đo latency/chất lượng OpenAI thật.
- `AUDIO_YOUTUBE=1 AUDIO_PIN_SRT=1 AUDIO_SPA_SOURCE=1 AUDIO_BLOCK_CONTENT_RUNTIME=1
  AUDIO_VIEW_RECOVERY=1 AUDIO_FAST_PROFILE=1`: source ownership, recovery, pinned pane,
  multilingual/SRT và reasoning thực sự ra wire.
- `check-pdf-ux.mjs`, `check-pdf-study.mjs`, `check-pdf-bilingual.mjs`:
  native PDF.js/OCR, shapes/edit/undo/export, reading/bilingual regressions.
- `check-anipm-context.mjs`: synthetic video/native CC trong fixture exact ani.pm/
  Settlar origins; menu/Apply/cache/context isolation, API mock. Không thay live-site QA.

Không kiểm tra profile Edge người dùng. Sau ZIP validation, copy staged code vào
`C:\Users\TIEN\Downloads\ReadFrog-Edge-1.58.0A`, manifest cuối; đối chiếu hash bằng
filesystem và để người dùng Reload entry đang có. Không xóa/reinstall/đụng browser data.

ZIP: **21.838.927byte**,472files; CRC, safe paths/root manifest và toàn bộ entry
khớp production build. So a.2 tăng3.415byte. SHA-256:
`c98127e57aacc5031ffffd09899f739af58b2a4a11d83cc1fa8c3114a0634ad3`.
Đã staged/copy đè472file, manifest cuối, đối chiếu hash tại thư mục cố định;
numeric1.59.1.2→1.59.1.3, display1.59.1A. Key/permissions không đổi,
không đụng profile/data Edge. **Chờ người dùng Reload**; không kiểm tra UI Edge.

**Chưa kiểm thử:** latency/chất lượng/phí OpenAI thật, ngữ cảnh trên mọi anime/
episode/server ani.pm thật và phiên Edge của người dùng. Fixture/mock chỉ xác minh
pipeline, payload, ownership, cache và controls. **Bị chặn:** không có bước triển
khai nào bị chặn; các mục trên là giới hạn kiểm thử, không được tính là đã pass.
