# PDF annotation UX a.9

Package1.59.1-a.9 / manifest1.59.1.9 / display1.59.1A; từ b20512a5,
upstream vẫn v1.59.1. Không nâng schema/config hoặc thêm permission/service.

Tham khảo phân tách Text/Popup và FreeText của Mozilla PDF.js:
[FreeTextEditor](https://github.com/mozilla/pdf.js/blob/master/src/display/editor/freetext.js),
[annotation layer](https://github.com/mozilla/pdf.js/blob/master/src/display/annotation_layer.js).
Áp dụng mô hình tương tác, không nhúng toàn bộ viewer mới hoặc sao chép mã
để thay các DB/engine riêng của fork.

- Ghi chú: icon SVG speech bubble nhỏ; hover/focus xem nội dung Unicode,
  ngày tạo và Sửa/Xóa. Bấm icon để nhập/sửa trong form trên trang, Lưu hoặc
  Ctrl+Enter; Hủy/Esc bỏ draft. Edit/delete dùng CAS/undo cũ, không tự upload.
  Tạo mới dùng ID `note-<timestamp>-<UUID>` (string ID trong format cũ), không
  thêm trường vào Study DB1. Ngày tạo giữ khi sửa, cũng ghi CreationDate khi
  xuất PDF. ID cũ không có timestamp hiển thị chưa có ngày, không bịa lịch sử.
- Ô chữ: click ngay trên chữ native PDF cũng đặt được editor; textarea ngay
  vị trí chọn, màu/cỡ, Lưu/Ctrl+Enter/Hủy/Esc. Bản nháp không ghi DB; sửa
  kiểm tra revision/identity, giữ geometry hiện tại và dùng shared undo.
  Kéo/resize/bấm đúp/Enter để sửa text đã lưu vẫn hoạt động. Loại trừ editor
  khỏi native selection/drawing/bilingual picking và mutation extraction.
- Sửa hình: bảng hẹp hơn, icon copy/paste/duplicate, bỏ hint dài thường trực;
  tên truy cập/tooltip và các tùy chọn nét/màu/undo cũ vẫn còn.
- Search: không còn Loại tài liệu/preset trong UI. Giữ case/whole word,
  accent/space/wildcard, AND/OR/proximity/range. Advanced đóng mặc định;
  ô tìm sticky ở trên, ưu tiên kết quả. Khung vẫn kéo/resize/keyboard/reset.
- Bỏ Quên vị trí; không đổi autosave/resume theo hash PDF/trang/offset/zoom.

Regression dùng Chrome/profile riêng, mock OpenAI, không thao tác Edge
người dùng: nhập ngay lên text native, hủy draft không ghi, move/undo ô chữ;
note hover/date/edit/delete/undo, export Unicode, reload/rename, OCR4 ngôn
ngữ, workspace và bilingual. Lint/type và unit PDF chạy trước build; kiểm
tra runtime endpoints vẫn giữ chính sách OpenAI-only. Chưa dùng key thật,
không đánh giá chất lượng dịch hoặc máy in vật lý ở đợt sửa UI này.

Validation:52 unit PDF pass; 172 production assertions pass ({'controls': 24, 'study': 32, 'workspace': 23, 'bilingual': 33, 'ux': 60}). UX dùng fixture ALCHIP read-only như baseline. Fixture fallback tổng hợp của harness chưa đạt assertion chia bullet; không đổi extractor để né assertion này. ZIP mới và bản chép local xác minh hash/identity/quyền; Reload numeric1.59.1.9/display1.59.1A.
