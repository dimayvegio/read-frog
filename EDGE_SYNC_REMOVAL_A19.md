# A.19 — Gỡ đồng bộ cấu hình qua tài khoản Edge

Baseline `27fefff3` / A.18; package `1.59.3-a.19`, numeric `1.59.3.19`, display `1.59.3A`.

Đã review việc gỡ service background, bảy RPC, trang React, codec/DB sync, UI popup/options và test transport không còn sử dụng. Không sửa config125, migrations đã phát hành hoặc các DB/ZIP/report khác. Xuất/nhập file cấu hình, glossary local và backup local vẫn hoạt động.

Các chỗ bổ sung khi review:

- Clear riêng alarm `edge-settings-sync` từ bản cũ, không xóa alarm backup/cleanup và không đọc DB sync để quyết định.
- Quy trình cập nhật chỉ copy đè nên xóa source không xóa được HTML/JS cũ trong thư mục cài đặt. `public/settings-sync.html` là **landing tĩnh không script/form/provider/storage**, ghi đè đúng URL cũ; không có launcher, route ứng dụng hay chức năng sync. Các chunk cũ không bị xóa nhưng không được landing hiện tại tham chiếu. Không thay thành redirect tự động.
- Gỡ quảng bá sync khỏi README, privacy policy/bản bundled, store listing và UI model/phát âm. Làm rõ mục xuất/nhập file để không nhầm với đồng bộ tài khoản. Cập nhật tài liệu merge/QA để không phục hồi chức năng đã gỡ; các báo cáo release cũ là lịch sử.
- Audit compiled runtime chặn tên RPC/DB/transport cũ; test nâng cấp dùng ZIP A.18 thật với đường cài đặt QA cố định, copy assets trước/manifest cuối rồi reload cùng ID. Test giữ private key, config, backup, notebook và dữ liệu sync cũ, đồng thời xác nhận alarm sync bị retire và file export/import vẫn hoạt động.

**Không truy cập hay xóa dữ liệu sync cũ** trên browser/account, không xóa DB cũ hoặc thay dữ liệu người dùng để làm sạch. Đây là gỡ tính năng, không phải xóa bản đã từng được trình duyệt lưu trên tài khoản. Dữ liệu cũ còn có thể tồn tại trong browser/account. Bản mới không có UI quản lý kho đó; không tuyên bố đã xóa cloud data.

Không có calls storage.sync trong mã ứng dụng; thư viện WebExtension dùng chung có thể vẫn chứa định nghĩa tên API `sync` nhưng không được feature này gọi. API spy trong QA phân biệt fixture reads với app calls, không suy ra cloud delivery từ dữ liệu giả.

Bằng chứng và giới hạn lần chạy nằm trong `store/VALIDATION.md`, `.codex/review-a19/`. Chỉ kiểm thử với profile riêng/API giả lập; không điều khiển Edge đang dùng, không live OpenAI hoặc tài khoản cloud thật. Khóa/sổ từ/tiến độ không thuộc ZIP extension. Giữ key/ID/path cài đặt và để người dùng Reload entry hiện tại.

## Chạy lại kiểm thử nâng cấp

Chuẩn bị ZIP A.18 thật (manifest `1.59.3.18`), SHA256 `0215bfd24128ff6847c0837a736259240f7ac36cf2671d9d26ef0fc42da4efee`, tại `.codex/review-a19/baseline-a18.zip` hoặc đặt `SYNC_REMOVAL_BASELINE` tới file đó. Không đổi nhãn ZIP mới để làm baseline. Build candidate vào `.output/edge-mv3`, rồi chạy `pnpm exec node scripts/debug/check-settings-sync-removal.mjs` bằng Node26 và Puppeteer/Chrome của bộ harness. Script chỉ dùng profile/thư mục cài đặt QA riêng.

Sổ dữ liệu kiểm thử không chứa khóa thật. So sánh giữ nguyên credential state/key revision; bootstrap journal có thể cập nhật digest cấu hình theo bootstrap hiện hành, không được diễn giải là khóa bị đổi. Kiểm tra tải icon bundled được tách khỏi request bên ngoài; tải tài nguyên local không phải API/provider call. DevTools loadUnpacked có thể reset alarm/page target; kiểm thử đóng/detach riêng worker rồi chọn target mới (loại toàn bộ target cũ) mới chứng minh cleanup alarm chọn lọc.
