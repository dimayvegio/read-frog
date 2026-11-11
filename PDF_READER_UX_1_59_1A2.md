# PDF Reader 1.59.1A — bản sửa UX a.2

Tiếp tục từ `f210b8c1`, nhánh `codex/upstream-1.59.1-openai`.
Package `1.59.1-a.2`, manifest `1.59.1.2`, hiển thị **1.59.1A**.
Không merge thêm upstream; giữ config125/AppDB7 và mọi DB/ZIP/report đã phát hành.

## Đã sửa

- Reader dùng cùng light theme cho chrome, selection pane, portal và native
  controls. Không đổi theme đã lưu hay theme trang extension khác. Ô chọn sổ/từ
  có foreground rõ ràng, tránh chữ trắng trên nền trắng.
- Công cụ tròn cũ ép về cạnh ngắn, nên kéo ngang không theo con trỏ. Nay mặc định
  vẽ **elip**, giữ **Shift** để vẽ tròn. Vuông giữ tỷ lệ khi vẽ. Icon có kích thước
  cố định và khoảng cách để trạng thái chọn không chồng nhau.
- **Chọn / sửa hình**: chọn ink, kéo thân để di chuyển; tám chốt cạnh/góc resize
  từng chiều; mũi tên chỉnh1px, Shift+mũi tên10px; Esc bỏ chọn. Một thao tác kết
  thúc chỉ ghi một revision/undo, không tạo annotation khác. Pointer cancel/mất
  capture/cuộn/resize/blur khi kéo bỏ preview dở. Giữ ink path và export cũ.
- Tìm kiếm/Mục lục/Trang dùng khung nổi, kéo tiêu đề, resize tám cạnh/góc, reset,
  bàn phím, viewport bounds và cleanup. Kích thước giữ khi đổi tab cùng khung;
  đóng/mở dùng mặc định. Geometry không vào config/sync. Bỏ cột320px làm PDF nhảy
  ngang khi mở menu. Ô tìm rộng, placeholder rõ, kết quả có trang/ngữ cảnh và nút
  trước/sau. Outline có lọc; file không có outline mặc định mở danh sách trang.
- Mở menu về Chọn chữ. Vẽ/edit không kích hoạt text-selection hoặc chọn paragraph
  song ngữ. Observer bỏ qua decorator annotation/search/selection, vẫn quan sát
  lớp chữ/OCR và render trang. Preview qua rAF, không chờ DB; save khi thả.
- Trên file ALCHIP thật, marker là **`●`** và dòng nối thụt theo phần chữ sau bullet.
  Bộ nhận diện nhận marker phổ biến, dùng contentX cho hanging indent; tách nhãn
  hai chấm và heading lớn hơn body. “SoCs.” vào cùng bullet, heading Senior tách
  khỏi Responsibilities. Dấu hai chấm trong bullet (following majors:) không cắt
  phần nối tiếp khỏi bullet. Không sửa text/canvas DOM hoặc gọi AI để chia đoạn.

## Tham khảo nguồn mở

Đọc ngày11/11/2026, tham khảo hành vi; không chép engine/editor hay đổi định dạng lưu:

- [PDF.js editor](https://github.com/mozilla/pdf.js/blob/master/src/display/editor/editor.js):
  resize handles, tọa độ theo trang, undo cả thao tác và keyboard adjustment.
- [PDF.js viewer](https://github.com/mozilla/pdf.js/blob/master/web/viewer.html):
  ô tìm riêng, previous/next và thông tin kết quả.
- [Zotero search box](https://github.com/zotero/reader/blob/master/src/common/components/sidebar/search-box.js):
  placeholder, focus và thao tác nhập rõ ràng.
- [Zotero selection](https://github.com/zotero/reader/blob/master/src/pdf/selection.js):
  tách selection/annotation và tọa độ tài liệu. Source vẫn theo giấy phép dự án gốc.

## Đo vẽ trước/sau

`scripts/debug/check-pdf-ux.mjs`, Chrome157, profile riêng, đúng PDF ALCHIP2 trang
người dùng báo lỗi. Cùng hash/file/viewport1560×1050; baseline ZIP1.59.1-a.1,
candidate a.2. Mỗi chế độ ba lượt tuần tự; không build/test khác trong lúc đo.
Mỗi lượt12 hình tròn,20 native mouse moves/hình, giữ Shift, xác nhận12 revision.
OpenAI mock và0 request. CDP Performance trước/sau toàn chuỗi, không GC/snapshot
trong timing.

| Trạng thái   | Main-thread TaskDuration trước |     Sau |  Thay đổi |
| ------------ | -----------------------------: | ------: | --------: |
| Tắt song ngữ |                        655,3ms | 471,4ms | giảm28,1% |
| Bật song ngữ |                        728,9ms | 574,7ms | giảm21,1% |

TaskDuration là thời gian tác vụ renderer, không phải pointer-to-photon hay thời
gian từ bấm đến lưu. LayoutCount gần như không đổi (276→277), không claim giảm
layout. Cả hai bản không có long task≥50ms trong bài này; chưa tái hiện được mức
giật nặng trên profile Edge của người dùng. Không khẳng định mọi file/thiết bị/
extension khác mượt hơn cùng tỷ lệ. Số mở/search/OCR a.1 vẫn là benchmark riêng
trong PDF_PERFORMANCE_1_59_1.md, không claim mới ở đây.

Evidence `.codex/pdf-draw-{before,final2}-{1,2,3}.log` và
`.codex/pdf-draw-bilingual-{before,final2}-{1,2,3}.log` trỏ tới JSON/raw metrics.
Latency tới DOM mutation chỉ là diagnostic, không là độ trễ màn hình. Không đưa
PDF gốc vào repo/ZIP hoặc provider.

## Kiểm chứng và giới hạn

Production regression trên đúng file báo lỗi: màu khi theme/OS tối; giữ preference
trang khác; ô sổ đọc được; elip/Shift-circle; move/resize/undo/cancel/keyboard; giữ
annotation ID; edit không chọn paragraph; search/menu resize không đổi width
canvas; outline/pages; viewport390px; cấu trúc bullet/heading; không uncaught errors.
Giữ regression PDF tools/OCR và song ngữ. Unit suite **4.525 passed,1 skipped**,
`SKIP_FREE_API=true`; lint/type-aware và formatter.

Chưa gọi OpenAI live hoặc test cùng profile Edge/extensions của người dùng.
Đây là heuristic layout: bảng, font/encoding lạ và đa cột phức tạp vẫn có thể cần
bôi đen/crop OCR explicit. Không auto-upload, OCR hoặc dịch khi mở/menu.

Ba lượt final dùng bản build bất biến `.codex/pdf-ux-final2-1591a2`, đúng compiled
code đóng ZIP a.2. Các lượt after thử ban đầu vẫn giữ làm lịch sử, không lấy số
tốt nhất từ các lượt đó để lập bảng final. Production UX có23 checks; tools/OCR29,
song ngữ33 và PDF/image/native-selection80 checks đều qua. API bị mock trong tests.
