# Đọc và dịch PDF local

## Bản 1.58.0-a.10 / manifest 1.58.0.11

Nhánh `codex/pdf-reading-panel`, tiếp tục từ `9e2a8724`, tên hiển thị **1.58.0A**.
Giữ config schema **124**, vocabulary DB **4**, ZIP từ vựng **5**, report học
**3** và mọi migration đã phát hành.

## Cách dùng

1. Ghi đè ZIP mới vào thư mục extension unpacked hiện có rồi **Reload** tại
   `edge://extensions`. Giữ ID/thư mục cũ để giữ key, cấu hình và sổ từ.
2. Bôi đen đoạn copy được trong PDF local → chuột phải → **Read Frog → Translate**.
   PDF được nhận diện sẽ mở sidebar. Có thể dùng mục **Dịch trong khung cố định
   (PDF)** hoặc bấm **PDF** trong popup extension để mở khung trước.
3. Chọn đoạn khác và dịch sẽ cập nhật cùng khung. Chỉ bôi đen không tự gửi văn
   bản. Bấm trở lại PDF không làm mất khung. Khi sidebar không hỗ trợ/mất user
   gesture, dùng cửa sổ kết quả trước đây; vẫn có làm sạch/lịch sử nếu biết tài liệu.
4. **Văn bản PDF và cách làm sạch** cho xem đoạn gốc/văn bản dùng để dịch,
   tắt nối dòng hoặc bật bỏ `-` khi từ bị ngắt. Đổi tùy chọn sẽ dịch lại đoạn.
5. **Lịch sử tài liệu** cho xem bản lưu không gọi API, xuất JSON hoặc xóa riêng
   tài liệu này. Chọn lại đoạn/cấu hình trùng dùng cache; **Regenerate** chủ động
   gọi dịch mới. Bản lưu ngôn ngữ khác được ghi rõ.

Giữ copy, TTS Microsoft/OpenAI, dừng, đổi ngôn ngữ, glossary chung và lưu từ vào
sổ. Khung hiển thị tài liệu được gửi gần nhất trong cửa sổ Edge đó, kèm tiêu đề
file. Không suy đoán số trang hoặc inject vào text layer của Edge native.

## Làm sạch và lưu trữ

- `pdf-text.ts` chuẩn hóa NFC/CRLF, nối dòng prose/soft hyphen, giữ đoạn trống,
  danh sách/bullet, tab/hàng có khoảng cách cột, công thức nhận diện được và code
  fence. Không có tọa độ nên không sắp lại thứ tự đọc nhiều cột hoặc hứa khôi
  phục mọi bảng/công thức. Có thể tắt để giữ nguyên văn bản.
- Hard hyphen được giữ mặc định: `well-\nknown` → `well-known`. Bỏ `-` là opt-in
  vì `infra-\nstructure` có thể cần ghép nhưng `well-known` cần dấu nối. Giới hạn
  cả raw/prepared 20.000 ký tự; không âm thầm cắt đoạn quá dài.
- Chỉ đoạn được chọn đi qua runtime OpenAI chính thức hiện có. Không đọc/tải
  lại/upload toàn PDF, không gửi tên/đường dẫn file vào prompt.
- Mã tài liệu là SHA-256 của URL browser cung cấp, bỏ fragment như `#page=…`.
  Chỉ tên và mã file được dùng trong lịch sử. Cùng đường dẫn là cùng tài liệu,
  không phải checksum nội dung file; cache vẫn xét toàn bộ đoạn/prompt. Chuyển
  file sang đường dẫn khác tạo lịch sử khác. Nếu không biết URL hợp lệ, vẫn
  dịch và ghi rõ chưa nhận diện file, không gộp các nguồn không rõ vào một sổ giả.
- Vùng chọn hiện hành trong `storage.session` có TTL 30 phút, channel theo
  browser window. Đóng tab nguồn/cửa sổ xóa text tạm; lịch sử đã lưu vẫn còn.
  Không nhầm host sidebar window ID với ID popup khi cleanup.
- IndexedDB riêng `read-frog-pdf-reading` **v1**: `documents`, `translations`,
  `meta`. Bản dịch lưu raw, prepared, output, ngôn ngữ, model, cờ làm sạch và
  thời gian. Không lưu reasoning, provider config, key hay đường dẫn file.
- Cache dùng document ID, instructions/prompt hiệu dụng (kể cả glossary khớp),
  OpenAI output identity, credential revision và cờ làm sạch. Đổi nội dung,
  model/reasoning/temperature/ngôn ngữ/prompt/glossary liên quan/key không dùng
  nhầm bản cũ. Không cache lỗi/partial/đoạn đã hủy.
- Tối đa **1.000 bản dịch / 32 MiB tổng**. Cùng khóa cập nhật thay vì nhân đôi.
  Ledger byte/count trong transaction tránh quét toàn bộ sau mỗi đoạn. Đầy
  vẫn hiện kết quả và báo chưa lưu, không tự xóa bản cũ. Xóa theo tài liệu tăng
  epoch, ngăn stream đang chạy phục hồi dữ liệu vừa xóa; giữ các tài liệu khác.
- **Xuất lịch sử JSON** dùng format `read-frog-pdf-history`, version **1**,
  chứa đoạn gốc/bản dịch do người dùng chủ động tải. Chưa có import JSON lịch
  sử. Không gộp vào settings backup hoặc ZIP từ vựng, không cloud sync.

## Bảo trì và kiểm thử

Giữ `openNativePdfPanel()` gọi `sidePanel.open()` đồng bộ trong lượt tương tác
menu, trước mọi await. Với guest tab `-1`/thiếu metadata, dùng window focus đã
biết; chỉ tra tab thật cho lifecycle, không gửi frame message sang tab khác.
Không gọi `windows.remove()` bằng host sidebar window ID. Giữ sender guard
`getNativePanelSelection`: đúng extension, trang `sidepanel.html`, frame trên
cùng. Popup cũ tiếp tục dùng channel opaque riêng.

`scripts/debug/check-pdf-reading.mjs` chạy production Edge bằng profile riêng,
PDF local thật, nút PDF/sidebar thật, OpenAI mô phỏng. Vùng chọn seed tại native
bridge; CDP không bấm OS context menu. Route menu/guest/focus/gesture/fallback/
sender/TTL có unit test. Assertion kiểm tra cache/offline/reload, raw/clean,
regenerate, export, tách/xóa tài liệu, hủy request cũ và chờ phản hồi trễ, overflow
320/390/600 px. Ảnh riêng sidebar không được gọi là ảnh toàn cửa sổ Edge.

**Đã sửa:** ba phần ưu tiên (sidebar cố định, làm sạch và lịch sử/cache), nút
PDF trong popup, xuất/xóa lịch sử từng file; đổi bản lịch sử dừng TTS của kết
quả trước. Dùng lại các đường dịch/TTS/lưu từ riêng hiện có.

**Đã kiểm thử 07/11/2026:** 4.068 test đạt, 1 test bỏ qua; `SKIP_FREE_API=true`
và loại live free-api. Format/lint/type-check đạt. Production Edge có **20**
assertion PDF, **68** assertion vocabulary cũ và **25** assertion sổ 1.000 từ /
2.000 MP3 / 9.000 lượt trả lời. Ảnh sidebar 390 px đã được xem; viewport
320/390/600 không overflow. Cache qua reload/offline, glossary/model/target/
prompt/key invalidation, quota/epoch/abort, nguồn guest và fallback có kiểm tra.

ZIP được đối chiếu CRC/từng file với build đã chạy browser, không có test key
hoặc profile trong gói. `ReadFrog-Edge-1.58.0A-PDFReading.zip`: **203 file**,
**6.267.226 byte**, manifest `1.58.0.11` / `1.58.0A`.
SHA-256: `17F1B89F22E897ADC243042AAE301B062430EB5C2F32F50418E84A32A1924425`.
HTML ôn từ giữ nguyên SHA-256
`301315CED603BDCB46649DBC63E57B529AEA866414123FD1392BFEF55405DDFF`;
không cần thay HTML để dùng ba tính năng PDF của extension.

Chưa kiểm thử OpenAI live hoặc tự động bấm OS context menu. OCR cho PDF scan,
trình đọc PDF.js riêng, đọc theo câu và bookmark là các giai đoạn sau, ngoài ba
phần ưu tiên của bản này. Không có phần bị chặn.
