FlowRead 1.59.3A.15 — OpenAI tạo ảnh dịch trực tiếp

- Package 1.59.3-a.15, numeric 1.59.3.15, display 1.59.3A. Baseline A.14.
- Dịch ảnh → OpenAI tạo ảnh dịch → mở/dán ảnh → chọn vùng/Toàn ảnh → chọn ngôn ngữ → Tạo ảnh dịch. OpenAI tự đọc/dịch/tạo PNG; extension hiển thị/tải nguyên ảnh API trả về, không OCR hay vẽ chữ local trong mode này.
- Có model GPT Image 2.6 Sunburst (mặc định), Flare 2.6, Sunburst 2.5 và ba mức chất lượng. Không tự đổi model/retry nếu tài khoản không hỗ trợ. View ảnh gốc/dịch, thu phóng và tải PNG không gọi thêm API.
- Cache RAM trong tab (hai ảnh, TTL30 phút, 48 MiB encoded chars). Bấm lại Tạo ảnh dịch dùng kết quả cũ; Tạo ảnh mới (có phí) mới bypass. Đổi target/model/quality/key/clear không dùng nhầm cache. Reload mất ảnh cache, nên tải PNG nếu cần lưu.
- Private fixed OpenAI Images Edits, final-only streaming/timeout/cancel và safe IE-* errors. Không upload PDF gốc, không persist ảnh trong DB/sync, không thêm quyền/dependency/published schema. Giữ mọi mode text/structured/local overlay cũ.
- Tạo ảnh có phí riêng; model có thể đổi font, kích thước hoặc chi tiết dù prompt yêu cầu giữ cấu trúc. Không bảo đảm pixel-perfect. Prompt/glossary của chế độ dịch văn bản không áp dụng.
- 4.814 unit tests passed/1 intentional skip; 17 production image-edit, 22 structured-image và 81 PDF/old-image regressions. Phản hồi OpenAI giả lập, chưa kiểm chất lượng API có phí; không chạy lại historical A.12 latency benchmark. Chi tiết VALIDATION.md.
- ZIP đã staging/copy asset-first/manifest-last vào thư mục extension cũ; Reload entry hiện tại để dùng numeric 1.59.3.15. Ba file local-overlay chưa commit ở workspace chính giữ nguyên, không gộp vào release này.

[Hướng dẫn/giới hạn](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.15/OPENAI_IMAGE_EDIT_A15.md) · [Privacy](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.15/PRIVACY_POLICY.md).

SHA-256 ZIP: `b7e8bd587d148f889b06bd8d5d90b1a289d13b93f1dadc61743c39365612db7a`.
