FlowRead 1.59.3A.11 — fallback cache, Markdown tables/code and PDF panels

- Package 1.59.3-a.11, numeric 1.59.3.11, display 1.59.3A. Baseline 1216a049.
- Chuột phải khi trang thiếu runtime: fallback xác minh MIME/frame/document trước khi đánh dấu HTML để dùng cache A.9. PDF/guest/nguồn chưa xác định giữ đường cũ; không đoán tất cả là web.
- Bảng GFM và code có nền/monospace/cuộn ngang; giữ số thứ tự danh sách. Không thực thi raw HTML hay tải ảnh từ model. Parser/giấy phép đóng gói local.
- Panel PDF nhớ vị trí/kích thước local có version và giới hạn viewport; không ghi trong preview/cancel. Khoảng trống tài liệu theo mép panel sau thả chuột, cleanup khi đóng; mobile vẫn overlay. Không gọi provider từ view/layout.
- 4.725 tests đạt / một intentional skip. Production Chrome HTML 18 + PDF/OCR 35 assertions; API giả lập, OCR local thật. Chưa đo OpenAI live, full 120-minute soak hay OS RAM.
- Không đổi Node/CI, quyền, provider/model hoặc published data formats. ZIP copy manifest cuối vào thư mục cũ, giữ dữ liệu. Reload entry cũ, numeric 1.59.3.11.

[Chi tiết](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.11/WEB_MARKDOWN_PDF_PANELS_A11.md) · [Privacy](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.11/PRIVACY_POLICY.md).

SHA-256 ZIP: `33e1ed05e43fa08be81ecd332e75d07e8c672cb59a89331c585c373d20afc754`.
