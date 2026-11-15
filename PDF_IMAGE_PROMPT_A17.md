# A.17 — Yêu cầu riêng, độ nét và dự toán PDF ảnh dịch

Package `1.59.3-a.17`, numeric `1.59.3.17`, display `1.59.3A`; baseline A.16. Giữ toàn bộ workflow/ranges/exports/cancellation của [A.16](PDF_IMAGE_TRANSLATION_A16.md). Không thêm quyền, dependency hay published schema/migration.

## Yêu cầu bổ sung

Trong **Tạo PDF ảnh dịch**, nhập yêu cầu ở textarea riêng, tối đa4.000 ký tự, không bắt buộc. Ví dụ: “Giữ nguyên RTL, STA, clock tree; dịch ngắn gọn; không đổi số liệu/công thức.” Chỉ gửi khi bấm Tạo, cùng một yêu cầu cho từng trang, trong chính POST image-edit hiện có. Không có lượt AI trung gian.

Prompt riêng có thể điều chỉnh thuật ngữ/giọng văn/trình bày mặc định; ngôn ngữ đã chọn, nội dung số liệu và đầu ra ảnh vẫn được nêu rõ trong chỉ dẫn ứng dụng. Đây là chỉ dẫn cho model, không bảo đảm tuân thủ hoàn hảo. Khóa, endpoint, model và giới hạn upload không thể đổi bằng prompt.

Nội dung chỉ giữ trong RAM của tài liệu đang mở; đóng/mở khung vẫn giữ, đổi/tải lại file hoặc đóng tab thì mất. Không thêm vào settings/sync/history/usage logs/ZIP ảnh. Sửa nội dung thực chất xóa các ảnh kết quả đang giữ, chưa gọi API. Khoảng trắng đầu/cuối được normalize, không tự làm mất cache. Textarea khóa khi batch chạy, request dùng snapshot đầu job.

Private wire thêm optional bounded `extraInstructions`; prompt identity nâng `image-edit-translate-v2`. Cả cache ảnh chia sẻ và completed-page scope xét hash prompt normalized. Giữ gửi mặc định khi trống và stale document/target/key/cache guards; không tự retry/paid repair.

## Độ nét

- Preset **Nhanh**:144 DPI /1K /Vừa; **Rõ nét** (mặc định PDF mới):200 DPI /2K /Cao; **Chi tiết cao**:300 DPI /4K /Tối đa.
- Có chỉnh từng lựa chọn: nguồn96/144/200/300 DPI; quality low/medium/high/xhigh/max; output Auto/1K/2K/4K. Trang Dịch ảnh OpenAI riêng cũng có output-size và năm mức quality, default cũ Auto/Cao vẫn giữ.
- 1K/2K là ngân sách khoảng1/4 triệu pixel; 4K tối đa8.294.400 pixel, không có nghĩa mọi trang đều đúng3.840 pixel cạnh dài. Kích thước tính theo tỷ lệ nguồn, căn16px, tỷ lệ tối đa3:1 và cạnh tối đa3.840. Mức phân giải cao có thể còn thử nghiệm theo API; không fallback trả phí tự động nếu bị từ chối. Ảnh quá dài/rộng cần chọn Auto hoặc vùng khác, báo lỗi trước khi gửi.
- Nguồn PDF vẫn giới hạn8 MP/4.096px/dataURL12 MiB; PNG đầu ra và bộ nhớ giữ các giới hạn cũ. Không tăng kích thước hay sharpen canvas hậu kỳ để giả độ nét; xem/tải nguyên output. Tùy chọn **100% — pixel gốc** giúp kiểm tra ảnh thực nhận. AI vẫn có thể sai/chữ nhỏ mờ, không phục hồi chắc chắn scan thiếu chi tiết.
- Scope cả hai cache xét resolution/quality/prompt. Chọn lại preset đang active không xóa kết quả. Chỉ explicit Create/Regenerate mới gọi provider; preset/giá/zoom không gọi AI.

## Ước tính chi phí

Khung ghi rõ **phí ảnh đầu ra ước tính**, USD/trang (có thể là khoảng theo tỷ lệ trang) và cộng toàn dải nếu tạo mới. Tái dùng ảnh đã xong không gọi API. **Không phải tổng phí**: chưa gồm image/text input, thuế hoặc thay đổi giá. Auto không có kích thước xác định thì hiển thị chưa ước tính được, không hiển thị0 USD.

Công thức offline được đối chiếu calculator công khai OpenAI ngày15/11/2026: quality-grid và rounding của calculator, model2.6 có hệ số low/medium riêng; rate output30USD/triệu token. Ví dụ chuẩn calculator2.6 low1024² là823 token≈0,02469USD cho đầu ra. Input báo riêng8USD/triệu image tokens và5USD/triệu text tokens; chưa biết số token trước request nên không đoán input là0. Bảng giá là snapshot trong ZIP, không có updater/price API. Nếu OpenAI đổi công thức/rates phải cập nhật code, tests và ngày đối chiếu.

Ước tính chỉ đọc metadata geometry tối đa20 trang và dùng cùng raster/dimension helper, không render thêm canvas/OCR/upload. Async ownership/key bỏ quote cũ khi đổi lựa chọn/đóng/đổi file. Dự toán không ghi vào usage DB hoặc giả thành phí đã đo; actual mixed-modality usage/cost vẫn giữ quy tắc unknown cũ.

Nguồn: [API image edits](https://developers.openai.com/api/reference/resources/images/methods/edit), [Image output calculator](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs), [Model parameters](https://developers.openai.com/api/docs/guides/image-prompting#model-parameters), [Pricing](https://developers.openai.com/api/docs/pricing). Calculator asset đối chiếu: `GptImageTokenCalculator.react.7TppeEsP.js`, không nhúng/chạy remote code trong extension; chỉ triển khai các phép tính theo dữ liệu công khai.

## Bảo toàn khi merge / QA

Giữ prompt chỉ RAM và explicit forwarding; strict request bounds/private credentials, normalized prompt hash cùng resolution trong cả shared và PDF scope. Không ghép với glossary/prompt dịch văn bản. Giữ raw PNG/ZIP/PDF ảnh, page geometry/rotation và các jobs của A.16.

Giữ dự toán output tách khỏi input/actual invoice, size/rate validation, công thức rounding và ngày/nguồn; không ghi guess vào numeric usage hay gọi dịch vụ mới. Rendering/selection/editor không tự gọi provider vì bổ sung trường này.

Các tests chính: generated-image/background, generated/client, cost-estimate, image-cost React và production `check-pdf-image-translation.mjs`. OpenAI output trong QA giả lập, không phải kiểm chất lượng/chi phí hóa đơn thật; số liệu và artifacts cuối ở `store/VALIDATION.md`.
