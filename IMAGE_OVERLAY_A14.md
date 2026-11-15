# FlowRead A.14 — thay chữ dịch trực tiếp trên ảnh gốc

Package `1.59.3-a.14`, numeric `1.59.3.14`, display `1.59.3A`; baseline `27c1a7cc` / A.13.

## Cách dùng

Trang Dịch ảnh → **Dịch trên ảnh gốc — thay chữ** → chọn ngôn ngữ OCR vị trí (English, Việt/Trung/Nhật + English) → crop hoặc Toàn ảnh → **Đo vùng chữ** (local, chưa gọi API). Kiểm tra/bỏ vùng dò sai rồi bấm **Dịch vùng đang bật** mới gửi crop để OpenAI đọc/dịch. Kết quả là ảnh cùng kích thước crop: nền, hình và đường bảng ngoài vùng thay chữ giữ nguyên.

Chọn khung chữ trên ảnh hoặc trong danh sách để sửa nguồn/bản dịch, màu chữ, nền xóa chữ, font Sans/Serif/Monospace, cỡ tối đa, đậm/nghiêng và X/Y/rộng/cao. Kéo khung để di chuyển, kéo góc dưới-phải để resize; pointer preview chỉ đổi outline, thả chuột mới repaint. Các chỉnh sửa này không gọi AI. Cỡ chữ tự giảm để vừa vùng; có cảnh báo khi quá nhỏ/không vừa. Zoom Vừa khung/100/150/200% và xem ảnh gốc chỉ đổi cách xem.

OCR bỏ sót: bấm **Thêm vùng chữ**, kéo trên ảnh gốc rồi **Dịch vùng đang bật**. Vùng mới chưa đọc được hiển thị `…`; OpenAI sẽ đọc bên trong tọa độ người dùng chọn khi chủ động dịch. Esc hủy chọn. Bỏ chọn **Thay chữ trong vùng này** để giữ nguyên vùng; code được heuristic local mặc định giữ nguyên nhưng có thể đổi lại. Đây không phải privacy redaction: ảnh crop đầy đủ vẫn gửi ở lượt vision, kể cả pixels của vùng không thay chữ.

**Tải ảnh PNG** lưu canvas kết quả tại thời điểm bấm; không kèm outline điều khiển và không gọi provider. Có thể tải ảnh gốc nếu đang bật xem gốc. Sửa/lật mode/đổi ảnh không tự lưu; dữ liệu ảnh/geometry chỉ RAM tab. Chỉnh nguồn/đổi ngôn ngữ cần chủ động dịch lại; không tự chi phí. **Tạo lại bản dịch** bypass cache một lần.

## Cơ chế và tham khảo

[Manga Image Translator](https://github.com/zyddnys/manga-image-translator) tách detection/OCR, xóa chữ và typesetting. A.14 áp dụng pipeline này bằng mã riêng, không sao chép Python/mô hình inpainting hoặc gọi dịch vụ của dự án. [Tesseract](https://github.com/tesseract-ocr/tesseract/blob/main/doc/tesseract.1.asc) có sparse-text segmentation; dùng Tesseract.js 7 và bốn gói ngôn ngữ **đã bundled** của FlowRead với PSM sparse, fixed extension asset paths, no remote defaults/cache download/new dependency.

Local OCR đo word boxes thật; vùng chỉ có ký hiệu/đường kẻ mặc định giữ nguyên, không gửi làm text cell. split khoảng trống lớn tránh gộp cột, expansion có kiểm tra đường kẻ/region kế cận. OpenAI vision đã chọn nhận crop và các ID/bounds đo local, đọc lại lỗi OCR rồi dịch có context toàn ảnh. Reply strict chỉ chứa `{id, original, translation}` đúng từng ID; không nhận tọa độ/font/style AI. Chặn thiếu/trùng/thừa/blank/invalid/too-long; không auto paid retry hoặc repair. Target picker override custom prompt ngôn ngữ khác; giữ glossary matching và model/key người dùng.

Ảnh gốc được giữ riêng. Chỉ các word masks được lấy mẫu màu nền, xóa và vẽ bản dịch có clip trong box đích; alpha trong suốt có đường clear riêng. Không repaint toàn trang/ô bảng. Font/màu ước lượng từ dữ liệu ảnh/metadata OCR, người dùng có thể chỉnh. Fit tối đa 10 bước đo font, wrap và cảnh báo overflow. Chưa có neural inpainting: nền hoa văn/gradient phía sau chữ, chữ xoay/dọc, font hiếm/inline style hoặc hình chữ nghệ thuật không thể hứa giống hệt tự động. Tính đúng cấu trúc/nghĩa vẫn cần kiểm tra với model thật.

## Bounds, ownership và dữ liệu

- Editor overlay không tự hạ ảnh >12 MP/cạnh6.000: báo dùng ảnh nhỏ hơn. Crop overlay ≤8 MP/cạnh4.096, PNG inline≤12 MiB, không silently resize/JPEG/flatten alpha; các mode cũ giữ behavior cũ.
- Một worker/lease mỗi image page, kể cả pending initialization. Timeout120s, abort/page close và terminate/bitmap/canvas cleanup; giữ lease đến khi worker khởi tạo muộn được dọn để ngăn burst worker. Worker startup bị treo có thể cần Reload tab; không tự tạo worker/provider mới.
- ≤6.000 words, 256 regions, 20.000 source characters, 60.000 reply JSON characters. Geometry/masks/style/image chỉ RAM; không thêm PDF/OCR DB/schema, config125, sync, vocabulary/review HTML, ZIP/report/migration hoặc quyền.
- Text cache dùng nguyên frozen image DB1/500 records/16 MiB/TTL30 ngày, namespace `image-overlay-v1`; key hash crop + original observed source/bounds + effective prompt/profile/glossary/target/key revision. Không lưu ảnh/geometry trong cache rows. Corrected OCR riêng `readText` không làm đổi source key khi chỉ chỉnh view/style. Local editing/view/PNG không gọi provider.
- Config/credential/clear epoch kiểm lại trước/ sau async commit; đổi file/crop/unmount/pagehide hủy job cũ, không promote late/partial/invalid reply. Chỉ fixed OpenAI Responses/private runtime cũ nhận crop explicit; không PDF binary, file path/title/URL metadata hoặc server OCR khác.

## Kiểm chứng

Unit tests gồm strict IDs/source geometry/fit/color/alpha/cache/cancel/worker-init leases và PNG lossless limits. Production harness dùng **OCR local thật**, mock OpenAI, kiểm ảnh bảng/nền màu, pixel ngoài vùng không đổi, request cold/warm, view/edit/drag/manual region, download PNG và phone. Kết quả cụ thể/SHA ở `store/VALIDATION.md`; ảnh giả lập API không chứng minh chất lượng OCR/dịch OpenAI live. Không đo OS RAM hay soak dài.
