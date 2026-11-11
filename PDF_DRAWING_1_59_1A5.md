# PDF: đường thẳng, mũi tên và nút dịch trên toolbar — a.5

Package `1.59.1-a.5`, manifest `1.59.1.5`, tên hiển thị **1.59.1A**.
Bắt đầu từ HEAD local `8d07b576` trên `codex/upstream-1.59.1-openai`;
upstream vẫn `v1.59.1` / `56d05e33`, config125. Không nâng/merge upstream ở đợt này.

## Đã sửa

- Bỏ riêng nút **Hình vuông** theo yêu cầu. Không xóa hoặc chuyển đổi hình vuông
  đã lưu; chúng vẫn dùng editor ink, bảng màu, tám chốt, tẩy/undo và xuất PDF cũ.
- Thêm **Đường thẳng** và **Mũi tên** có icon/tooltip. Kéo theo hướng bất kỳ,
  kể cả ngang/dọc hoặc ngược chiều. Giữ Shift khóa ngang/dọc/45° theo pixel
  thật của trang, rút ngắn ở mép trang thay vì thay đổi hướng đã khóa.
- Bấm vào nét để chọn; kéo thân để di chuyển, kéo chốt đầu/cuối để đổi hướng
  hoặc độ dài. Điểm đối diện giữ nguyên. Chốt có thể dùng phím mũi tên1px,
  Shift+mũi tên10px; Delete hoặc bảng Xóa, bốn màu và undo/redo dùng chung.
  Vùng chọn có khoảng đệm để đường ngang/dọc vẫn có hai chốt dễ bấm.
- Preview giữ trong SVG/rAF, không ghi DB khi rê. Mỗi lần thả hợp lệ chỉ ghi
  một revision/undo với cùng ID; cuộn/blur/resize/Escape/pointer cancel hủy nét
  đang sửa. Endpoint không nhận pointer khác. Giữ nguyên đường native chọn chữ
  và paragraph bilingual; không remount PDF host để đổi công cụ.
- Chuyển **Dịch đoạn đã chọn** từ góc dưới trái lên toolbar, ngay trước
  **Tải PDF có chú thích**. Nút luôn ở đó, chỉ bật khi đã chọn chữ trong chế độ
  Chọn chữ. Pointerdown giữ selection đến thao tác dịch, dùng cùng snapshot,
  nguồn/trang/giới hạn và pipeline dịch cũ. Khi mở pane, reflow PDF có thể làm
  mất vùng tô chọn trực quan; văn bản đã chụp gửi dịch vẫn chính xác.

## Hợp đồng cần giữ khi nâng upstream

Không thay published schema, migration, config/sync hoặc DB/ZIP/report.
Study DB1 vẫn annotation `kind: ink` với `points` chuẩn hóa0..1 và bốn màu.
Line có hai điểm; arrow là polyline năm điểm `[đầu, đích, cánh1, đích, cánh2]`,
nhãn `Mũi tên` trong trường `text` vốn có. Nhãn cùng dạng điểm phân biệt arrow
với rectangle/square cũ; không thêm enum hay tái diễn giải hình khép kín.
Tệp xuất dùng các đoạn ink của exporter hiện có, kể cả hai cánh mũi tên.

Không đưa square toolbar trở lại khi merge, nhưng giữ khả năng đọc/sửa/xuất
square cũ. Giữ ellipse/Shift-circle, rectangle, native OCR/selection, F20/F21,
ba canvas và cancellation/revision conflicts. Chọn/vẽ/sửa/tải annotation không
gọi OpenAI; dịch chỉ theo hành động explicit. Dữ liệu từ vựng, âm thanh,
credential và browser profile không tham gia cập nhật này.

## Đã kiểm thử

- Unit PDF:33 kiểm tra, gồm geometry, Shift trong portrait/landscape, tọa độ
  biên, chỉnh hai đầu, dữ liệu square cũ và xuất line/arrow/square ra PDF thật.
- Bộ unit toàn repo:4.538 passed,1 skipped; free API external được cố ý
  loại với `SKIP_FREE_API=true`. Lint/type-aware và formatter đạt.
- Production UX60 kiểm tra trên Chrome157.0.8103.40, profile độc lập, fixture
  PDF ALCHIP hai trang. Bao gồm kéo ngang/dọc/ngược, sửa chốt, hủy, keyboard,
  xóa/undo exact geometry; regression ellipse/eight handles/theme/search/outline,
  mobile390px và nút dịch ở toolbar. Chỉ một request dịch explicit tới mock,
  payload đúng đoạn chọn; không provider call từ công cụ vẽ/sửa.
- Regression production trên đúng bundle ZIP phát hành: OCR/annotation/export29,
  bilingual33 và PDF/image80 kiểm tra đạt. OCR thật dùng các model local đã
  đóng gói; provider dịch mock, không dùng key/profile thật của người dùng.

Bằng chứng nằm trong `.codex/pdf-draw-a5-*.log` và các thư mục evidence được
log chỉ ra; fixture cá nhân không được đưa vào repo/ZIP hoặc gửi OpenAI.
Không dùng thời gian chạy test để tuyên bố cải thiện độ trễ/RAM.

## Chưa kiểm thử và bị chặn

Chưa thử thủ công trên profile Edge của người dùng hoặc gọi API trả phí thật;
provider trong regression được mock. Không khẳng định mọi PDF mã hóa, bảng,
rotation hay thiết bị cảm ứng đã được thử riêng. Không có hạng mục bị chặn.
User Reload entry Read Frog hiện có và mở lại trang PDF để nhận mã mới.

## ZIP và cập nhật local

Một ZIP `ReadFrog-Edge-1.59.1A.zip`,21.840.391byte,472file;
SHA256 `cf544e6f725ef0a7048a1c5e7074c0670578e4000537b95bae7ce063cc20bd90`.
Root manifest hợp lệ, version `1.59.1.5` / `1.59.1A`; key và quyền giữ nguyên.
Đã stage và copy đè assets/entrypoints trước, manifest cuối vào
thư mục cố định `C:\Users\TIEN\Downloads\ReadFrog-Edge-1.58.0A`; cả472 hash
khớp ZIP qua filesystem. Cài đặt trước1.59.1.4, sau1.59.1.5; report
`.codex/extension-update/20261111T165935Z-ff56c1ea/update-report.json`. Không xóa/mirror folder, không gỡ/cài extension và không đụng
browser data. Copy code không phải backup dữ liệu. Reload còn do người dùng.
