FlowRead 1.59.3A.17 — Yêu cầu riêng, độ nét và ước tính phí ảnh

- Package 1.59.3-a.17, numeric 1.59.3.17, display 1.59.3A; baseline A.16.
- Tạo PDF ảnh dịch có ô Yêu cầu bổ sung (tối đa4.000 ký tự). Gửi cùng mỗi trang sau khi bấm Tạo; chỉ nhớ trong tài liệu đang mở, không thêm vào settings/sync/history/usage/export. Sửa nội dung tách cache; khoảng trắng đầu/cuối không làm gọi thừa. Textarea khóa trong batch và không phát sinh thêm một lượt AI trung gian.
- Preset Nhanh / Rõ nét / Chi tiết cao; mặc định PDF mới200DPI +2K +Cao. Có nguồn300DPI, output1K/2K/4K và quality Rất cao/Tối đa. Kích thước tính theo tỷ lệ trang và giới hạn API (cạnh3.840px,8,29MP,16px,3:1); mức lớn có thể thử nghiệm. Trang Dịch ảnh riêng cũng thêm output size/quality. Không phóng lớn bitmap trả về để giả tăng độ nét, raw PNG vẫn nguyên byte.
- Khung Ước tính phí ảnh đầu ra theo mỗi trang/cả dải, dựa trên calculator OpenAI được đối chiếu15/11/2026, chạy offline/không gọi provider. Chưa gồm phí ảnh/prompt đầu vào, thuế và thay đổi giá; không phải báo giá trọn gói hay phí thực tế. Auto chưa xác định kích thước thì không ước tính, không hiển thị0USD. Dự toán không ghi vào actual usage.
- Giữ PDF ảnh local assembly/ZIP/raw PNG, sequential completed-page cache/resume/cancel và private fixed OpenAI transport. Không upload PDF binary, thêm quyền/dependency/schema/migration hoặc tự retry/repair có phí. AI vẫn có thể sai hoặc mờ chữ nhỏ; high-resolution không đảm bảo nội dung chính xác.
- 4.841 unit tests passed/1 intentional skip;37 PDF-image +19 standalone-image +81 PDF/image legacy production checks. API giả lập; chưa đo chất lượng/phí hóa đơn thật. Lint/formatter/runtime-store audits pass. Chi tiết VALIDATION.md.
- ZIP đã staging/copy đè assets trước, manifest cuối vào thư mục extension cũ; Reload entry hiện tại và mở lại Reader để dùng numeric1.59.3.17. Ảnh/prompt đang giữ trong RAM cần lưu trước khi Reload. Ba file overlay local chưa commit vẫn giữ nguyên, không gộp vào release.

[Hướng dẫn/giới hạn](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.17/PDF_IMAGE_PROMPT_A17.md) · [Privacy](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.17/PRIVACY_POLICY.md).

SHA-256 ZIP: `61f78c4ab7afa593fcd0c69cf50deda4522604f77b92340d0a537d77495c1625`.
