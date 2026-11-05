# Read Frog — Edge / OpenAI text + Microsoft TTS

Fork dựa trên commit e361e991b4127dd0d03473ed9329c24885fe420a (1.57.0).
Giữ engine dịch trang, hai chế độ bilingual/translation-only, selection,
annotation, custom actions, streaming, queue, glossary và Microsoft TTS.

Văn bản dùng OpenAI chính thức tại https://api.openai.com/v1/responses.
API key được nhập trong Options và lưu vào IndexedDB riêng tại thiết bị;
config, backup và export thông thường không chứa key. TTS Microsoft hoạt động
độc lập với key OpenAI, gồm voice tùy chỉnh, chia đoạn, cache và offscreen playback.

Các dịch vụ hosted Read Frog, tài khoản, Notebase, Google Drive sync,
telemetry, provider dịch khác và proxy mạng tổng quát đã được gỡ.
YouTube dùng lại engine và giao diện phụ đề nguyên bản: tải track CC từ YouTube,
dịch trước theo cửa sổ look-ahead, batch/cache, sidebar transcript, xuất SRT và đầy đủ
thiết lập hiển thị/style. Phần dịch và phân tích vẫn qua OpenAI hiện tại. Nút Read Frog
có trên watch, embed và Shorts như bản gốc; video cần có track phụ đề. Tạo phụ đề bằng
dịch vụ hosted của Read Frog không được khôi phục. ani.pm và trình đọc PDF riêng
thuộc roadmap sau.

## Dịch đoạn bôi đen trong PDF trên Edge

Bôi đen văn bản trong trình đọc PDF của Edge, bấm chuột phải và chọn
Read Frog → Translate. Khi tài liệu không có content-script receiver, extension
mở cửa sổ kết quả, dùng lại giao diện dịch bôi đen trên web: chọn ngôn ngữ,
streaming, copy, đọc thành tiếng, xem vùng chọn và dịch lại. Chọn đoạn khác trong
cùng tab sẽ cập nhật cửa sổ đó; yêu cầu dịch cũ bị hủy.

Chỉ đoạn được chọn đi qua runtime OpenAI hiện có. Extension không tải lại hoặc
upload file PDF, không cần can thiệp vào canvas/text layer của trình đọc. Áp dụng
glossary chung; không áp dụng glossary theo website cho PDF. Vùng chọn tối đa
20.000 ký tự, lưu tạm trong storage.session, tách khỏi config/export. Dữ liệu được
xóa khi đóng cửa sổ kết quả hoặc tab nguồn; vùng chọn quá 30 phút không được dùng
lại và được dọn khi có yêu cầu tiếp theo. PDF scan không có text chưa được hỗ trợ
OCR.

## Chạy và đóng gói

Dùng Node 26.13+ và pnpm 12.16.1 theo package.json/lockfile.
Không cần backend, Google OAuth hoặc PostHog env.

```sh
pnpm install --frozen-lockfile
pnpm lint
SKIP_FREE_API=true pnpm test
pnpm build:edge
pnpm zip:edge
```

Trên PowerShell, đặt `$env:SKIP_FREE_API='true'` trước khi chạy test.
Trong Edge, mở trang Extensions, bật Developer mode và Load unpacked thư mục
`.output/edge-mv3`. Mở Options, lưu OpenAI key rồi Test connection.
Thiết lập giọng đọc tại Text to Speech.

Không đặt API key trong biến môi trường WXT_*_API_KEY khi build production.
Các override transport Microsoft sẵn có được mô tả trong .env.example;
giữ mặc định nếu không cần thay đổi transport.

## Dữ liệu cục bộ

Bootstrap v121 phải hoàn tất trước khi UI cho phép ghi config. Key OpenAI cũ
chỉ được tự kích hoạt khi xác định rõ endpoint chính thức. Key proxy hoặc
không rõ nguồn được giữ riêng và yêu cầu nhập lại. Xóa key tạo tombstone để
migration retry không khôi phục key đã xóa. Import, restore và reset config
không thay key hiện tại; chúng thay toàn bộ config canonical qua cùng write queue.

Backup đọc được được chuyển sang cấu trúc portable. Backup không đọc được
được giữ trong vùng recovery riêng trước khi bỏ bản public và có thông báo
trong Options. Import/export glossary bằng tay và Undo được giữ; chỉ xóa
snapshot base của dịch vụ cloud đã gỡ.

Icon/font được đóng gói, custom CSS bị lọc tài nguyên mạng trước khi chèn,
và layout HTML tiếp tục qua sanitizer của layout engine. Kiểm thử mock,
build, kiểm tra Edge thủ công và live API là các mức bằng chứng khác nhau.

## Bản quyền

Giữ license và attribution của dự án gốc. Xem LICENSE và THIRD_PARTY_NOTICES.md.
Tài liệu upstream còn lại trong readmes/ mô tả sản phẩm gốc và có thể khác fork này.

## 📜 Commercial License Grant

<img src="assets/tabbit.avif" alt="Tabbit" height="20" /> **Meituan Tabbit Browser Team**: Free license (at no cost) for closed-source commercial use, limited to v1.21.3 and earlier versions (commit [`724863f`](https://github.com/mengxi-ream/read-frog/commit/724863fdbc2d777766cada6c111235534ee03ca0)). Granted on March 3, 2026, 9:00 AM (Vancouver Time, UTC-8).

<div align="right">

[![Back to top][back-to-top]](#readme-top)

</div>
