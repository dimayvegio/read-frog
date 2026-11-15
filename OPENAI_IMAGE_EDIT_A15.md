# A.15 — OpenAI tạo và trả ảnh dịch trực tiếp

Package `1.59.3-a.15`, manifest numeric `1.59.3.15`, display `1.59.3A`. Baseline A.14. User request: send the selected image to OpenAI, ask it to translate lettering while preserving appearance, then show the image OpenAI returns.

## Cách dùng

Reload extension hiện có. Mở **Dịch ảnh → OpenAI tạo ảnh dịch**, dán/mở ảnh, chọn vùng hoặc **Toàn ảnh**, chọn ngôn ngữ và bấm **Tạo ảnh dịch**. Mặc định GPT Image 2.6 Sunburst/chất lượng Cao; có Flare 2.6 và Sunburst 2.5 trong allowlist. Thông báo quyền model/HTTP được hiển thị an toàn nếu tài khoản chưa hỗ trợ; không tự đổi model hoặc retry.

Kết quả là `<img>` dùng nguyên PNG OpenAI trả về. **So với ảnh gốc**, thu phóng và **Tải PNG** không gọi AI hay vẽ lại kết quả. Download giữ nguyên byte PNG, không qua canvas/JPEG/OCR/typesetting của extension. Canvas chỉ dùng để chọn/cắt nguồn trước khi gửi.

Lần đầu nâng lên A.15 chọn mode mới, sau đó nhớ mode người dùng chọn bằng preference local `imageGenerationPreferredV1`/`imageTranslationMode`. Các mode text/structured/local-overlay trước đây vẫn có; local overlay đổi nhãn thành **Thay chữ trên máy — chỉnh vùng thủ công**. Không biến PDF OCR thành image generation.

## Private runtime và giới hạn

- Port riêng `flowread-image-edit-v1`, chỉ trusted top-frame `image-translate.html` của extension. Private credential đọc ở background; client chỉ biết credential revision. Payload strict inline crop/model/quality/target/revision; không nhận URL, endpoint, file path, provider prompt hay key từ web.
- Một POST cố định `https://api.openai.com/v1/images/edits`, JSON `images:[{image_url:dataURL}]`, app-owned target-language prompt, `n:1`, PNG, size auto. Stream có headers sớm cho tác vụ dài MV3; partial_images=0, chỉ nhận đúng một `image_edit.completed`. JSON completed responses cũng được validate. Không proxy/Files upload/URL download/mask/local OCR/remote font.
- Tối đa hai job background, một job UI, keepalive port hiện có, stop/disconnect/pagehide abort, timeout 10 phút. HTTP/network/provider errors dùng IE-* app-owned, không phát tán provider body/credential. Không retry hoặc paid repair. Dừng chờ không hoàn tác phí nếu OpenAI đã nhận yêu cầu.
- Crop giữ PNG lossless/alpha, giới hạn hiện có 8 MP/cạnh4.096/dataURL12 MiB. Editor nguồn 12 MP/cạnh6.000, không silent downscale trong mode mới. Output tối đa32 MiB base64, cạnh4.096/8,5 MP; kiểm signature/IHDR và decode bitmap đầy đủ, không nhận SVG/URL/partial image.
- API có thể đổi kích thước, font hoặc chi tiết; prompt yêu cầu giữ bố cục/tables/code/nền nhưng không bảo đảm pixel-perfect/chữ nhỏ chính xác. Đây là tạo ảnh bằng AI, không phải sửa text vector. Prompt/glossary của chế độ dịch văn bản không áp dụng cho mode này.
- Tạo ảnh tính phí riêng. Numeric usage log ghi trạng thái/thời gian/model, không chứa ảnh/prompt/key/path. Mixed image/text-token pricing chưa được giả thành đơn giá text; chi phí trong app có thể unknown.

## Cache và dữ liệu

Chỉ RAM trong tab ảnh: LRU tối đa hai kết quả, 48 MiB ký tự dataURL, TTL30 phút. Key xét crop hash/model/quality/target/prompt-version/key revision và epoch cache. **Tạo ảnh dịch** dùng cache; **Tạo ảnh mới (có phí)** bypass chủ động; clear ảnh xóa cache cũ lẫn cache RAM và reject pending output. Đổi target/key/epoch làm kết quả cũ không còn hợp lệ. Reload/đóng tab mất cache ảnh; hãy tải PNG nếu cần giữ.

Không ghi bitmap/geometry vào image DB1/settings/sync/notebooks. Không sửa published schema/migration hay quyền. Không upload PDF binary: PDF screenshot chỉ gửi crop được chọn sau explicit action.

## Bảo toàn khi merge

Giữ private sender guard, fixed endpoint/allowlist, target/key guards trước và sau request; không đưa key xuống page/content scripts. Giữ raw PNG view/download và các view controls miễn API. Đường mới phải tách khỏi Tesseract/local overlay/text translation, không gọi thêm OCR hay text API trước/sau tạo ảnh. Giữ modes cũ và dữ liệu đã phát hành.

Các file chính: `src/entrypoints/background/generated-image.ts`, `src/utils/image-translation/generated-schema.ts`, `generated.ts`, `src/entrypoints/image-translate/generated-view.tsx` và integration `app.tsx`. Regression production: `scripts/debug/check-generated-image.mjs`; unit tests ở background/generated-image và image-translation/generated.

## Nguồn API đã đối chiếu 15 November 2026

[OpenAI image edits](https://developers.openai.com/api/reference/resources/images/methods/edit), [Image generation](https://developers.openai.com/api/docs/guides/image-generation), [GPT Image 2.6 Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst), [Chrome MV3 lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

Kiểm thử dùng production extension/private port với PNG OpenAI giả lập, không dùng API có phí và không chứng minh chất lượng model thật. Xem `store/VALIDATION.md` cho số liệu/artifact cuối.
