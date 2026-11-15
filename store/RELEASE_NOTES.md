FlowRead 1.59.3A.16 — Tạo PDF ảnh dịch bằng OpenAI

- Package 1.59.3-a.16, numeric 1.59.3.16, display 1.59.3A. Baseline A.15.
- PDF Reader → Tạo PDF ảnh dịch → nhập từ trang/đến trang (ví dụ1–4) → chọn ngôn ngữ/model/chất lượng/DPI → Tạo ảnh dịch các trang. PDF.js tạo PNG nguyên trang local, gửi OpenAI Image Edits tuần tự, hiển thị nguyên ảnh OpenAI trả về.
- Xem từng trang, tải PNG, ZIP gồm mọi ảnh đã xong hoặc ghép PDF trên máy. PDF mới giữ khổ trang gốc, fit ảnh không kéo méo; là PDF ảnh, không có lớp chữ để tìm kiếm/chọn hay liên kết.
- Tối đa20 trang/lượt và RAM20 ảnh/96 MiB encoded chars. Dừng/lỗi giữ trang đã xong; bấm tiếp tục chỉ gửi phần thiếu. Mở lại khung/bấm tạo cùng cấu hình không gọi lại bốn trang đã hoàn thành. Đổi file/target/key/cache có owner guards; không tự retry hoặc paid repair.
- Chỉ gửi ảnh toàn trang do bạn chọn, không upload PDF binary/tên/path metadata. Toàn trang có thể gồm nội dung đã loại trừ trong dịch theo đoạn; ghi chú/nét vẽ riêng FlowRead không được thêm vào ảnh gửi. UI nêu rõ phạm vi và phí riêng từng ảnh trước khi tạo.
- Không thêm dependency/quyền/DB/config/migration. Giữ các chế độ dịch ảnh cũ và native PDF reading/search/OCR/annotation; private OpenAI port chỉ thêm exact trusted PDF reader page.
- 4.829 unit tests passed/1 intentional skip;23 PDF image,17 direct image,81 PDF/image legacy và35 local PDF OCR/study checks. Một lần full test đầu timeout khi có tải đồng thời; chạy riêng config9/9 rồi full rerun đạt, không đổi timeout/code. OpenAI giả lập; chưa kiểm chất lượng API có phí, không cam kết font/bố cục chính xác tuyệt đối. Xem VALIDATION.md.
- ZIP đã staging/copy asset-first/manifest-last vào thư mục extension cũ. Reload entry hiện tại rồi mở lại Reader để dùng numeric1.59.3.16. Ba file overlay local chưa commit vẫn giữ nguyên, không gộp vào release này.

[Hướng dẫn/giới hạn](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.16/PDF_IMAGE_TRANSLATION_A16.md) · [Privacy](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.16/PRIVACY_POLICY.md).

SHA-256 ZIP: `dc554035f0feeee28f59355ebe1f8780c8ce410a9e3147da001e2fb036af2042`.
