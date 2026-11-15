FlowRead 1.59.3A.9 — reuse HTML selection translations

- Package 1.59.3-a.9, manifest 1.59.3.9, display 1.59.3A; baseline 901a488e / A.8.
- Sửa khung dịch HTML: quay từ Giải thích/Tóm tắt về Dịch hoặc chọn lại cùng đoạn đã hoàn tất dùng cache local, không gọi OpenAI thêm. Bấm lại tab đang chọn không gọi API. Nút tạo lại vẫn chủ động dịch mới.
- Cache có giới hạn 500 mục / 16MiB / 30 ngày, phân biệt nội dung/ngôn ngữ/model/prompt/glossary/key revision. Không lưu kết quả đang dở/bị hủy; đổi cấu hình hoặc xóa cache chặn kết quả cũ đến muộn. Bản dịch trước khi cập nhật chưa có cache này có thể cần dịch lại một lần.
- Không đổi API/permission/schema/migration, không upload PDF; giữ tính năng HTML/PDF/video/learning hiện tại.
- 4.701 tests đạt, 1 intentionally skipped; 35 focused tests; 16 production Chrome assertions với API mock. Full-suite/build/audit xem VALIDATION.md. Chưa kiểm API thật, Edge runtime hoặc đo chi phí; PDF/video a.8 là bằng chứng lịch sử.
- ZIP được stage/copy manifest cuối vào ReadFrog-Edge-1.58.0A; giữ ID/browser data. Reload entry cũ, numeric 1.59.3.9.

[Bộ hồ sơ store](https://github.com/dimayvegio/read-frog/tree/v1.59.3A.9/store) · [Privacy](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.9/PRIVACY_POLICY.md) · [Thay đổi và giới hạn](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.9/HTML_SELECTION_CACHE_A9.md).

SHA-256 ZIP: `87fb8c738a1380c5dde0612f001803e6137ec5e930cbbde558050c4918c3341f`. Corresponding source at v1.59.3A.9.
