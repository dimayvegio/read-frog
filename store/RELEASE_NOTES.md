FlowRead 1.59.3A.12 — OCR ảnh giữ cấu trúc

- Package 1.59.3-a.12, numeric 1.59.3.12, display 1.59.3A. Baseline 1da3aa02.
- Trang Dịch ảnh có chế độ Giữ cấu trúc: tiêu đề, đoạn văn, bảng từng hàng/cột/ô, danh sách và code nguyên văn. Hai chế độ plain cũ vẫn hoạt động.
- Sửa nội dung/từng ô; gộp đoạn liền nhau, tách tại dòng trống, bỏ khối rồi chủ động dịch lại. Các thao tác sửa chỉ local, không gọi AI.
- Chưa có cache: một vision OCR + một text translation. Cùng crop/kết quả dùng lại cache; đổi target dùng lại OCR. Sửa nguồn chỉ gửi text. Code/ô rỗng giữ local; không tự paid retry khi thiếu/trùng cells hoặc sai JSON.
- Đây là giữ cấu trúc nội dung, chưa pixel-perfect font/màu/geometry, rowspan/colspan hoặc danh sách lồng. Cần xem/sửa OCR khi ảnh khó; crop không đi qua server OCR khác.
- 4.764 unit tests đạt / một intentional skip; Chrome production: 22 kiểm tra ảnh cấu trúc + 83 PDF/ảnh/cache cũ + 18 HTML. API giả lập; chưa đánh giá chất lượng OpenAI live. Edge launch riêng gặp TargetCloseError trước test, không tính là pass.
- Giữ private OpenAI endpoints, config/DB/sync/ZIP formats cũ, quyền, model, extension ID và standalone review HTML. ZIP chỉ tăng 5.411 byte so với A.11, không thêm model/package OCR.
- Đã copy vào thư mục cũ theo workflow; Reload entry hiện tại để dùng numeric 1.59.3.12.

[Chi tiết và nguồn tham khảo](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.12/IMAGE_STRUCTURE_A12.md) · [Privacy](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.12/PRIVACY_POLICY.md).

SHA-256 ZIP: `eb5ab74f6587230a0580ce817088b984cb9ecdaac1c4a076ab022f83e4680d05`.
