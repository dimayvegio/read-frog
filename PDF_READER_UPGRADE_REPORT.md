# Báo cáo PDF Reader 1.58.1A — build 1.58.1.7

## Đã sửa / bổ sung

- Baseline trước sửa: `5641db73c5f05b04d7d0448cb41eb7a1abfdb2f7`, nhánh
  `codex/upstream-1.58.1-openai`. Không nhận thêm upstream trong đợt này;
  mốc upstream vẫn `v1.58.1` / `8f015c4a830951dd98fd836989e7348849e60cea`.
- UI reader có icon, nhóm chọn/vẽ/tẩy/ghi chú, bảng màu, điều hướng/zoom,
  menu tìm kiếm/mục lục/trang/chú thích. Desktop dành chỗ cho menu bên trái;
  viewport hẹp dùng khung đóng được, không tràn ngang.
- Tìm kiếm `abx*xyz`, từng kết quả riêng kể cả cùng trang, ngữ cảnh giữ hoa
  thường, đánh dấu chính xác bằng Range và cuộn đến kết quả đang chọn.
- Chú thích tự lưu theo hash trong DB1 riêng; revision transaction ngăn ghi
  đè tab khác/khôi phục dữ liệu đã xóa, undo/redo phiên, xuất bản PDF có chú
  thích Unicode. PDF gốc không thay đổi; tọa độ xuất xét rotation/crop PDF.js.
- OCR local bốn ngôn ngữ tạo lớp chọn chữ có tọa độ, tích hợp F20 hiện có.
  Đọc từng trang/range có giới hạn, timeout/cancel, cache text/geometry trên
  máy; không upload/tự OCR/dịch. OpenAI OCR vùng khó mở crop editor cũ, chỉ
  gửi sau thao tác đọc/dịch của người dùng, không đoán box từ model.
- Runtime Tesseract/pdf-lib lazy; tài nguyên đóng gói, loại8.58 MB WASM rời
  bị trùng với payload nhúng trong ba bản `.wasm.js` v7; vẫn đủ ba biến thể
  CPU để có fallback. Không thêm permission/config migration hoặc sửa các
  schema đã phát hành. Standalone vocabulary HTML giữ nguyên SHA256
  `a640c20d7aa510642dbda1dd59411e41c0660670ae2a97594d3654ab56aedb64`.

## Đã kiểm thử

- Lint/types, formatter và unit suite: **4.380 passed / 1 skipped** với
  `SKIP_FREE_API=true`; free external
  API suite loại có chủ đích. Unit mới kiểm transaction, stale OCR save,
  geometry bounds, wildcard/NFC/CJK và export tọa độ PDF xoay/Unicode.
- Production extension trên **Chrome157.0.8103.40** profile riêng:
  `check-pdf-study.mjs` **26 kiểm tra**, `check-pdf-bilingual.mjs` **33 kiểm
  tra**, `check-pdf-reading.mjs` **80 kiểm tra**. PDF.js/Tesseract worker/model
  thật; OpenAI/Microsoft translation dùng fixture/mock, không gọi trả phí.
- Kiểm OCR Anh/Việt/Trung/Nhật không HTTP request; copyable geometry vào F20,
  tìm tiếng Nhật qua nhiều word box, lưu qua reload/rename, hủy khi đổi trang,
  annotate/erase/undo/redo/note/export, outline và viewport390px.
- ZIP kiểm toàn bộ CRC, manifest/root paths, đủ model/CPU assets, không có
  key fixture/log/source map; bản standalone vocabulary trong ZIP giữ hash.

## Chưa kiểm thử / giới hạn

- Chưa thao tác trên profile Edge người dùng, Edge/Firefox thật, điện thoại
  thật hoặc gọi OpenAI OCR/translation/TTS trả phí trong đợt này.
- Scan thử là trang chữ rõ do fixture tạo, không đại diện mọi sách scan;
  không công bố tốc độ/độ chính xác tổng quát từ các fixture đó. Công thức,
  bảng, chữ viết tay, multi-column phức tạp và mọi PDF mã hóa/ký số chưa kiểm
  đầy đủ. OCR tiếng Nhật fixture có chữ nhận sai: cần xem lại nguồn khi dùng.
- PDF xuất chứa chú thích, không nhúng lớp OCR/bản dịch; cache OCR/chú thích
  DB1 chưa nằm trong settings backup/sync. Không sửa nội dung gốc/form/ký số.
- ZIP tăng từ **9.13 MB** ở build1.58.1.6 lên khoảng **21.84 MB**, chủ yếu do
  worker/WASM và bốn bộ ngôn ngữ ngoại tuyến. Kích thước này là gói trên đĩa,
  không phải số RAM đang dùng; các model không nạp khi chỉ dịch web.

## Bị chặn

Không có bước triển khai bị chặn. Kiểm thử Edge và API thật phía trên là
phần chưa thực hiện, không được tính thành kết quả đã xác minh.

Hợp đồng và hướng nâng cấp: [PDF_READER_TOOLS.md](PDF_READER_TOOLS.md),
[FORK_DIFFERENCES.md](FORK_DIFFERENCES.md), [UPSTREAM_UPGRADE_GUIDE.md](UPSTREAM_UPGRADE_GUIDE.md).
