# Chuẩn bị Chrome Web Store / Edge Add-ons

Đối chiếu tài liệu chính thức ngày11/11/2026. Chưa upload hoặc xin xét duyệt.

Chrome nhận ZIP tối đa **2GB**, theo [hướng dẫn publish](https://developer.chrome.com/docs/webstore/publish).
ZIP fork khoảng22MB nên dung lượng hiện tại không gần giới hạn này.
[Microsoft hướng dẫn](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)
dùng ZIP/Partner Center; trang đó chưa nêu một trần dung lượng số cụ thể để xác nhận.
Không suy ra Edge được duyệt chỉ vì Chrome cho phép kích thước đó.

## Những gì build hiện tại đã có

- ManifestV3, version numeric hợp lệ và `version_name` hậu tốA.
- PDF.js worker/WASM/fonts, Tesseract worker/core và bốn language models đóng gói.
  Test OCR thật chạy khi chặn DNS, không request HTTP cho OCR.
- Tính năng PDF mới không thêm permission, không gửi PDF/ảnh tự động.
- OpenAI/API là xử lý dữ liệu explicit; site-rules remote là JSON có chữ ký và
  validator, không phải mã JS/WASM được tải rồi thực thi.
- Private credentials không có trong ZIP, public settings export hoặc sync.
- Có notices/licenses cho PDF.js/pdf-lib/Tesseract/models; giữ các file đó khi nén.

## Cần làm trước lần nộp thật

1. Chủ tài khoản developer chuẩn bị listing, tên/branding của fork, ảnh/icon,
   support URL và privacy policy đúng hành vi thật. Kiểm tra nghĩa vụ GPL và
   redistribution/source, không dùng tên upstream gây hiểu nhầm bản chính thức.
2. Rà permissions từng mục và giải thích `all_urls`, file access, tabCapture,
   scripting, microphone explicit, downloads, storage/unlimitedStorage, offscreen.
   File access do người dùng bật; capture/ghi âm không tự khởi động.
3. Khai báo dữ liệu gửi OpenAI (text, crop ảnh, âm thanh theo hành động người dùng),
   giá/API key cá nhân, retention tại nhà cung cấp và các giới hạn sync. Không
   tuyên bố extension không dùng mạng hoặc không xử lý dữ liệu nhạy cảm.
4. Audit **compiled ZIP** về remote executable code/CSP/eval. MV3 phải đóng gói
   mã JS/WASM, kể cả nhánh thư viện không sử dụng; xem [quy định RHC](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code).
   Tesseract hiện được cấu hình local rõ ràng và test active path offline, nhưng
   vendor bundle còn default CDN fallback không được gọi. Cần loại nhánh đó có
   kiểm soát khi chuẩn bị Store và chạy lại bốn ngôn ngữ; đợt này chưa chứng nhận
   toàn bộ bundle đạt review Store. Không thay bằng CDN để giảm ZIP.
5. Build riêng từng browser, chạy test trên Edge và Chrome chính thức. Chuẩn bị
   reviewer instructions và tài khoản/test credential nếu Store yêu cầu; không
   nhúng API key vào package. Không bỏ guard riêng của fork để qua review.
6. Store cấp ID khác với unpacked. Lập phương án chuyển dữ liệu explicit trước
   khi đổi ID, gồm key, notebooks và các DB local; không âm thầm thay manifest key.
   Bản ZIP hiện tại vẫn cập nhật bằng ghi đè **cùng thư mục** rồi Reload ở Edge.

ZIP cài thử và một build được Store phê duyệt là hai trạng thái khác nhau.
Chưa kiểm chứng delivery cloud Microsoft hoặc quy trình Store bằng tài khoản thật.
