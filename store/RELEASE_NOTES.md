FlowRead 1.59.3A.19 — Gỡ đồng bộ cấu hình tài khoản Edge

- Package `1.59.3-a.19`, numeric `1.59.3.19`, display `1.59.3A`; baseline A.18 (`27fefff3`).
- Gỡ launcher, trang ứng dụng, service background, bảy RPC và codec/DB access của đồng bộ Edge. Vô hiệu hóa riêng alarm cũ và URL cũ khi copy đè; không mở hoặc xóa dữ liệu đồng bộ đã lưu trên browser/account.
- Giữ xuất/nhập file cấu hình, backup local, khóa riêng và dữ liệu học. Không thay permission, dependency, migration đã phát hành hoặc schema dữ liệu.
- Cập nhật privacy/listing/tài liệu nâng cấp; không phục hồi sync hoặc Send feedback khi merge upstream.
- 4.844 unit tests passed/1 skip có chủ đích; 21 bộ browser/646 checks đạt, có nâng cấp thật A.18→A.19. API giả lập/$0; không tuyên bố đã thử site live/DRM hay soak dài.
- ZIP SHA256 `a4965cb2cc5a5c1cca40b74de5afd67a7fb5d611d5bb0b9491aad7aa414092e4`, đã kiểm 470 hashes tại thư mục cài đặt cũ.
- Kiểm thử và giới hạn được ghi trong [VALIDATION.md](VALIDATION.md). User Reload entry hiện tại sau khi copy vào thư mục cũ; không cài thêm extension. Lưu ảnh/audio đang giữ trong RAM trước khi Reload.

[Hợp đồng A.19](../EDGE_SYNC_REMOVAL_A19.md) · [Privacy](../PRIVACY_POLICY.md)

---

## Lịch sử A.18 (không phải tính năng sync hiện tại)

FlowRead 1.59.3A.18 — Review model riêng và dịch ảnh

- Package 1.59.3-a.18, numeric 1.59.3.18, display 1.59.3A; baseline A.17.
- Model riêng theo tác vụ được xác định trước cache và request; background dùng đúng snapshot. Lưu rõ ràng, validate model custom/tham số và báo lỗi; tải lại tab để áp dụng. Preference mới chỉ local, chưa thuộc sync/backup cấu hình.
- Các đường chấm phát âm, file text, SRT, live giữ model đúng endpoint đã kiểm thử. Danh sách model account chỉ tải chủ động, bounded/trusted/private; không tự dùng model ảnh/audio khác allowlist.
- Dịch ảnh từ menu chỉ lấy đúng ảnh đã chọn hoặc mở screenshot để crop thủ công. Không fetch có credentials, chọn nhầm ảnh lớn khác hay tự gửi AI.
- Prompt riêng trên trang ảnh/overlay; sửa prompt không hiển thị nhầm kết quả generate cũ. Sửa hidden/zoom/kích thước ảnh gốc, mặc định model ảnh dùng cùng allowlist ở PDF và trang ảnh. OCR gộp dòng bảo thủ trong paragraph/cột, dừng ở kẻ bảng; cleanup/clip không tràn vùng.
- Hoàn thiện nhãn và tên file FlowRead. Giữ extension identity, schema/migration và định dạng dữ liệu; không upload PDF binary, thêm quyền/dependency/provider khác hay tự retry có phí.
- 4.863 unit tests passed/1 skipped; 21 browser suites/649 final checks. API giả lập/$0, đã ghi rõ một lần timeout dubbing ban đầu và các lần chạy độc lập đạt 22/22; không tuyên bố test đầy đủ site live/DRM hoặc độ ổn định qua soak dài. Chi tiết VALIDATION.md.
- ZIP đã copy vào thư mục cũ, manifest cuối, kiểm 472 hashes. Reload entry hiện tại và mở lại trang để dùng numeric1.59.3.18. Lưu ảnh/audio đang giữ trong RAM trước khi Reload.

[Review/hợp đồng](../FEATURE_MODELS_REVIEW_A18.md) · [Privacy](../PRIVACY_POLICY.md)

SHA256 ZIP: `0215bfd24128ff6847c0837a736259240f7ac36cf2671d9d26ef0fc42da4efee`.
