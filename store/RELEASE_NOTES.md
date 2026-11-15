FlowRead 1.59.3A.14 — thay chữ dịch trên ảnh gốc

- Package 1.59.3-a.14, numeric 1.59.3.14, display 1.59.3A. Baseline 27c1a7cc / A.13.
- Dịch ảnh → Dịch trên ảnh gốc → Đo vùng chữ (OCR local, chưa gọi API) → kiểm tra/bỏ vùng sai → Dịch vùng đang bật. OpenAI đọc/dịch theo ID; tọa độ đo local hoặc người dùng chọn, không để model đoán.
- Giữ ảnh nền/bố cục ngoài các vùng thay chữ; chỉnh source/translation, font/cỡ/màu/đậm/nghiêng, kéo vùng/resize, zoom, thêm vùng thủ công và tải PNG. View/edit/PNG không gọi provider; dịch lại dùng bounded image cache.
- PNG giữ crop dimensions/alpha, không silent JPEG/downscale. Giới hạn crop 8 MP/cạnh4.096; font hiếm/nền hoa văn/chữ xoay có thể cần chỉnh, chưa pixel-perfect hay neural inpainting. Checkbox giữ vùng không phải redaction: crop vẫn gửi toàn bộ cho vision khi bấm dịch.
- Không thêm dependency/model/quyền/endpoint hoặc published schema/migration. Vẫn private OpenAI-only; không gửi PDF binary. Các mode ảnh cũ giữ nguyên.
- Local OCR thật + OpenAI giả lập: pixel artwork ngoài vùng không đổi, PNG download khớp canvas, cache/view/edit/manual/cancel và phone. Bộ tests/harnesses và giới hạn ghi trong VALIDATION.md.
- ZIP staging, copy assets trước/manifest cuối vào thư mục cũ; Reload entry hiện tại để dùng numeric 1.59.3.14.

[Hướng dẫn/giới hạn](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.14/IMAGE_OVERLAY_A14.md) · [Privacy](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.14/PRIVACY_POLICY.md).

SHA-256 ZIP: `c1aba386dff7d0ceaf271352e0957d2ca7af80bda095ab66c6b278f28f007428`.
