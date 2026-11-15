FlowRead 1.59.3A.7 — store candidate + automatic video audio context

- Package 1.59.3-a.7, manifest 1.59.3.7, display 1.59.3A.
- AI phụ đề và giọng đọc → Tự phân tích khi xem → bật AI, tiếp tục phát. Tự lấy mẫu audio ~15 giây mỗi phần 10 phút; không cần file/microphone/tua/pause, không tự retry trả phí. Dùng CC toàn cảnh có giới hạn cho ngữ cảnh, chỉ gán giọng cho câu đã nghe; người chưa rõ dùng giọng mặc định. Giữ Chuẩn bị trước tối đa 10 phút/8MiB.
- Logo ngựa FlowRead; support admin@4dv.top; hồ sơ store gồm policy, listings, quyền/dữ liệu, reviewer, source/license, hình và hướng dẫn giữ dữ liệu theo ID.
- OCR đóng gói local-only/fail-closed, không CDN code/new Function; API Providers có disclosure trực tiếp OpenAI/chi phí/PDF trước nhập key. Không upload PDF gốc.
- 4.680 test đạt, 1 skip; 44 production Chrome checks YouTube/ani.pm (capture/audio thật, API mock), OCR offline Anh/Việt/Trung/Nhật; format/lint/build/audit 201 scripts đạt. Chưa đo live model/chất lượng/cost. Edge profile kiểm thử riêng tự thoát trước tải extension; cần người dùng Reload/test trên Edge. Chưa nộp/được duyệt store.
- ZIP được stage/copy manifest cuối vào thư mục cố định ReadFrog-Edge-1.58.0A; kiểm hash 470 file, giữ key/quyền/browser data. Chỉ Reload entry đang có, numeric 1.59.3.7.

[Bộ hồ sơ store](https://github.com/dimayvegio/read-frog/tree/v1.59.3A.7/store) · [Privacy](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.7/PRIVACY_POLICY.md) · [Thay đổi và giới hạn](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.7/STORE_AUTOMATIC_AUDIO_A7.md).

SHA-256 ZIP: `c434437adc93f5ec57ccc25175164e793d5bdf066ac4b55d89d6f21f90dd1534`. Corresponding GPL source is available at the exact tag and GitHub source archives. No store submission performed.
