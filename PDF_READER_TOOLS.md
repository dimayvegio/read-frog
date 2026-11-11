# PDF Reader — công cụ đọc và OCR (F24)

**Hiện tại1.59.1-a.6 / manifest1.59.1.6:** thêm Chỉnh đoạn trong song ngữ,
Shift+bấm chọn nhiều hình/di chuyển/resize/copy/kiểu nét và Bookmark tên/màu/
ghi chú, nhớ chính xác vị trí. Dữ liệu mới nằm trong sidecar DB1, giữ mọi DB
cũ. Cách dùng, giới hạn và hợp đồng nâng tiếp:
[PDF_WORKSPACE_1_59_1A6.md](PDF_WORKSPACE_1_59_1A6.md).

**Snapshot1.59.1-a.5 / manifest1.59.1.5:** vẽ tròn/elip, chữ nhật, đường
thẳng, mũi tên và nét tự do. Bỏ nút vuông theo yêu cầu; hình vuông cũ vẫn còn.
Giữ Shift với line/arrow để khóa ngang/dọc/45°. Bấm nét vẽ để chọn, kéo thân
để di chuyển, kéo hai đầu để sửa line/arrow; các hình khác giữ tám chốt resize.
Bảng màu/Xóa, Delete, phím mũi tên và undo/redo dùng chung, giữ ID và ghi
một revision mỗi thao tác hoàn tất. Không ghi DB trong pointer preview.
**Dịch đoạn đã chọn** nằm trên toolbar trước **Tải PDF có chú thích**; bôi đen
trước để bật nút. Không còn nút nổi góc dưới trái. Không tự dịch/upload khi mở,
cuộn hoặc chọn công cụ. Xem [PDF_DRAWING_1_59_1A5.md](PDF_DRAWING_1_59_1A5.md).

**Snapshot1.59.1-a.2 / manifest1.59.1.2:** theme PDF đồng nhất sáng; ô chọn
sổ có màu chữ rõ. Công cụ tròn vẽ elip theo hai chiều, giữ Shift để vẽ tròn.
Chọn **Chọn / sửa hình** → bấm hình → kéo thân để di chuyển hoặc chốt cạnh/góc
để resize; có mũi tên/undo/redo. Khung Tìm kiếm/Mục lục/Trang kéo/resize/reset được,
ô tìm rộng, nút kết quả trước/sau và lọc outline. File không có outline mở danh
sách trang. Đã sửa bullet `●` và hanging-indent trong file ALCHIP.
Xem [PDF_READER_UX_1_59_1A2.md](PDF_READER_UX_1_59_1A2.md).
Các giới hạn chưa sửa kích thước hình trong snapshot a.1 bên dưới đã được thay thế.

**Cập nhật 1.59.1A:** thêm icon **Hình tròn / Hình vuông / Hình chữ nhật**.
Chọn một công cụ và màu Vàng/Xanh lá/Xanh dương/Đỏ rồi kéo trên trang; hình
tròn/vuông giữ đúng tỷ lệ. Cùng cơ chế tẩy, tự lưu, undo/redo và xuất PDF đang có.
Hình là ink khép kín trong DB1 cũ, không cần migration; chưa có chọn/kéo/sửa kích
thước một hình sau khi lưu (có thể undo hoặc tẩy rồi vẽ lại).

Reader đo trang mở/resume trước và sửa placeholder khi cần, vẫn ba canvas.
OCR dải trang dùng một worker rồi giải phóng; hủy/chuyển file/trang dừng tác vụ.
Search RAM LRU tối đa2.048 trang/~16MiB text payload, không tạo index khi chỉ mở
file, không tự OCR. Tìm lần đầu có thể chậm hơn; tìm lặp dùng cache.
Số đo và giới hạn: [PDF_PERFORMANCE_1_59_1.md](PDF_PERFORMANCE_1_59_1.md).
Mô tả build1.58.1-a.7 bên dưới giữ làm baseline lịch sử.

Build `1.58.1-a.7`, manifest `1.58.1.7` / **1.58.1A**, bắt đầu từ HEAD
`5641db73c5f05b04d7d0448cb41eb7a1abfdb2f7`, sau upstream `v1.58.1`.
Đây là phần mở rộng F20, giữ reader PDF.js, dịch/TTS/MP3/thư viện hiện có.

## Cách mở và sử dụng

Popup Read Frog → **PDF** → **Đọc PDF và tự lưu vị trí** → **Mở PDF trên máy**.
Đây là reader riêng, không thay đổi công cụ PDF mặc định của Edge.

- **Tìm kiếm / Ctrl+F**: nhập chữ hoặc mẫu `abx*xyz`, Enter. `*` khớp một
  đoạn ký tự bất kỳ giữa các phần chữ, kể cả qua dòng. Không phân biệt hoa
  thường; giữ dấu tiếng Việt. Đây không phải biểu thức chính quy. Mẫu chỉ
  gồm `*` không có kết quả. Dấu sao đầu/cuối không mở rộng phần đánh dấu.
- Danh sách có **từng lần xuất hiện**, số trang và ngữ cảnh. Bấm một kết quả
  để đến đúng trang, cuộn đến vị trí và đánh dấu riêng lần xuất hiện đó.
  Giới hạn 100 kết quả/trang, 1.000 kết quả/lần tìm, 20 triệu ký tự/lần quét;
  có Dừng tìm. Trang scan cần OCR trước; tìm kiếm không tự OCR/gọi OpenAI.
- **Mục lục / Trang**: đọc mục lục nhúng nếu file có, hoặc chọn số trang
  theo nhóm 100. Chỉ xử lý đích trang nội bộ; không mở URL/action nhúng.
- **Chọn chữ** rồi **Tô sáng đoạn chọn**, bốn màu; **Vẽ**, **Tẩy chú thích**,
  **Ghi chú**; **Hoàn tác / Làm lại** (`Ctrl+Z` / `Ctrl+Shift+Z`) trong phiên.
  Công cụ có icon/tooltip, nút chính giữ chữ; `Esc` đóng menu và về chọn chữ.
  Nét vẽ cần pointer chính, chỉ lưu khi thả; pointer cancel không lưu nét dở.
- **Chú thích** liệt kê các ghi chú/tô sáng/nét vẽ để đến trang hoặc xóa.
  Nạp lại khi file được sửa ở tab khác. Chú thích tự lưu trên máy; đổi tên
  PDF không mất vì nhận diện bằng SHA256 nội dung.
- **Tải PDF có chú thích** xuất bản sao gồm tô sáng/nét vẽ và sticky note
  Unicode; giữ file gốc. Không nhúng bản dịch hoặc lớp chữ OCR vào file xuất.
  PDF mã hóa có thể đọc bằng PDF.js nhưng pdf-lib không hỗ trợ xuất bản sao
  đó; báo lỗi, không bỏ qua mã hóa. Không phải công cụ sửa chữ gốc/ký số/form.

## OCR và đọc song ngữ

**OCR trên máy → Đọc chữ OCR** dùng Tesseract.js 7 / core7 LSTM integer,
model English, Vietnamese, Simplified Chinese, Japanese. Worker, ba biến
thể WASM CPU và bốn model đóng gói từ dependency pinned; không CDN, không
upload PDF/ảnh, không tính token. Chọn ngôn ngữ chính đúng với trang.

- Mặc định chỉ trang đang xem; có thể chọn đến trang, tối đa20 trang/lượt.
  Chạy tuần tự, mỗi trang một worker; tối đa một khởi tạo worker đang chờ.
  Timeout120 giây/trang, có dừng thủ công; đổi trang/file/đóng reader hủy job,
  bỏ kết quả muộn và giải phóng canvas/worker. Không OCR tự động khi mở/cuộn.
- Một canvas tạm tối đa xấp xỉ6 triệu pixel cho OCR. Reader vẫn chỉ giữ ba
  canvas PDF lân cận. Không giữ ảnh trong DB; chỉ text và tọa độ chuẩn hóa.
- Chữ OCR tạo overlay riêng có thể chọn/copy/tô sáng/tìm kiếm. Bật **Song ngữ
  theo đoạn** để dùng chính pipeline F20: cache-only không fallback provider,
  dịch trang/đoạn là thao tác riêng, cùng TTS/MP3/thư viện và linked scrolling.
- OCR đã lưu tự khôi phục trên máy khi mở lại cùng nội dung PDF. **Xóa chữ
  OCR đã lưu** trở về lớp chữ gốc, không xóa chú thích.
- **OpenAI OCR vùng khó** mở công cụ ảnh F11/F12 hiện có. Chọn vùng và bấm
  đọc/dịch ở đó; dùng model/key riêng đang cấu hình, API có tính phí. Không
  tự fallback trả phí. Kết quả ở khung dịch ảnh, không đoán tọa độ để thay
  lớp chữ PDF. Giữ one-use capture, crop-only payload và cache text/hash cũ.
- Tesseract phù hợp scan rõ; ảnh mờ, chữ viết tay, công thức, bảng phức tạp
  và thứ tự nhiều cột chưa tương đương OCR cloud chuyên dụng. Kiểm tra chữ
  trước khi dùng bản dịch. Không hứa giữ nguyên bố cục khi xuất bản dịch.

## Hợp đồng dữ liệu và nâng upstream

DB độc lập **`read-frog-pdf-study`, v1**, store `documents` khóa `id` (SHA256).
Record `{id, revision, annotations, ocr}`; annotation gồm `{id,page,kind,color,
boxes,points,text}`; OCR page `{page,language,engine,words}` với engine identity
`tesseract7-int-v1`, mỗi word `{x,y,width,height,text}`. Geometry chuẩn hóa0–1,
không lưu file/ảnh/đường dẫn/API key. Schema1 phát hành phải đóng băng; nâng
additive sau này bằng version mới, không sửa PDF DB2/vocabulary/ZIP/sync.

- Compare-and-swap revision trong transaction ngăn ghi đè tab khác và hồi
  sinh dữ liệu sau clear. Clear giữ revision; xung đột yêu cầu nạp lại, không
  tự chọn người thắng. Quota errors hiện rõ; không âm thầm xóa chú thích.
- Tối đa2.000 annotations/file, 4.096 điểm/nét, 100.000 điểm/file, 2.000 ký tự
  ghi chú, 200 vùng/highlight; 20 trang OCR/file, 6.000 words/trang; JSON8M ký
  tự/file và100 tài liệu có dữ liệu. Xóa cả chú thích/OCR giải phóng suất tài
  liệu; tombstone revision nhỏ vẫn giữ. Undo tối đa50 snapshot phiên.
- DB này ngoài Edge settings sync/backup/vocabulary và PDF history cũ. Xuất
  PDF mang chú thích sang máy khác nhưng chưa có import/export cache OCR.
- PDF host giữ keyed DOM cũ, canvas/text layer không bị thay bởi công cụ;
  overlay tách biệt, OCR layer ưu tiên khi có. Search highlights dùng DOM
  Range, không sửa span gốc; paragraph selection vẫn dùng F20.
- Build hook đóng gói tài nguyên OCR local; `pdf-lib` và Tesseract runtime
  chỉ import khi xuất/OCR. Không thêm quyền extension, provider hoặc schema
  cấu hình. TTS/CC/Learning/audio live F23 hoàn toàn độc lập.

## Kiểm thử và giới hạn

- Unit tests: transaction conflict/clear, dữ liệu độc lập/bounds, tìm literal
  và wildcard/NFC, export PDF xoay/ghi chú Unicode/file gốc.
- `scripts/debug/check-pdf-study.mjs`: production extension trong Chrome profile
  tách biệt; PDF.js thật, OCR Anh/Việt/Trung/Nhật bằng worker/model thật, chọn
  kết quả, highlight/pen/undo/redo/note/erase, reload/rename, outline, xuất
  PDF, cancel OCR, ba canvas và viewport390px; không gọi OpenAI thật.
- Chạy lại `check-pdf-bilingual.mjs`, `check-pdf-reading.mjs`, lint/types và
  unit suite (free API intentionally excluded). Bằng chứng cụ thể ghi ở
  báo cáo cuối đợt; không coi test mock là tốc độ OpenAI thật.
- Chưa kiểm thử thủ công trên profile Edge của người dùng, thiết bị điện
  thoại thật, mọi PDF mã hóa/ký số/scan nhiều cột và OpenAI trả phí live.

Tham khảo bố trí nhóm công cụ và điều hướng (không sao chép giao diện/assets):
[Acrobat workspace](https://helpx.adobe.com/acrobat/desktop/get-started/learn-the-basics/workspace.html),
[Firefox PDF Viewer](https://support.mozilla.org/en-US/kb/view-pdf-files-firefox-or-choose-another-viewer).
API OCR: [Tesseract.js7](https://github.com/naptha/tesseract.js/blob/v7.0.0/docs/api.md).

## Bản a.7

Xem [PDF_READER_1_59_1A7.md](PDF_READER_1_59_1A7.md) cho menu, tìm kỹ thuật,
zoom/kéo trang, in/ô chữ/gạch chân, Alt+Enter, trích trang, dải OCR/dịch và
các giới hạn mới. Đây là bản bổ sung additive workspace DB2, không sửa Study
DB1. Bảo toàn OCR legacy20 trang; cache mới lưu theo trang,500 trang/file,
LRU geometry6, một worker/100 trang mỗi lượt explicit. Chỉ chữ/crop được chọn
gửi trực tiếp OpenAI; không upload binary PDF hoặc tự chạy provider/OCR khi mở.

## Phím dịch PDF a.8

Từ package1.59.1-a.8/manifest1.59.1.8, bôi đen trong trình đọc Read Frog rồi
bấm **Alt+Q** bằng một tay. Alt+Enter cũ vẫn là alias tương thích. Phím chỉ
chạy khi selection nằm trong PDF, ngoài ô nhập và chế độ vẽ; bỏ qua Shift,
Ctrl/Meta/AltGraph, IME composition và key repeat. Dùng pipeline/cache cũ,
không thêm permission, cấu hình, migration hoặc upload PDF.
