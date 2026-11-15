FlowRead 1.59.3A.8 — HTML fixed pane + selectable audio analysis

- Package 1.59.3-a.8, manifest 1.59.3.8, display 1.59.3A.
- Khung cố định dùng cho HTML, không nhầm tài liệu PDF/history/cleanup. Bôi đen đoạn khác rồi chọn Translate ở toolbar/menu sẽ cập nhật cùng khung, không gọi thêm translator. Highlight nguồn bằng CSS native, giữ DOM/link, còn sau khi bỏ native selection, xóa khi đóng/chuyển nguồn.
- AI phụ đề và giọng đọc → Thời lượng audio phân tích: 15s / 30s / 1 / 2 / 5 / 10 phút. Dùng cho cả Tự phân tích khi xem và Chuẩn bị trước từ vị trí hiện tại trên video dài. Thu trước chờ đúng thời gian phát, xong restore vị trí/tốc độ paused. CC ngữ cảnh có giới hạn; chỉ gán giọng cho câu đã nghe. Đổi duration tắt AI/chờ bật lại, không tự tính phí/paid retry. MP3/WAV toàn video vẫn giới hạn 10 phút/8MiB.
- Logo ngựa FlowRead; support admin@4dv.top; hồ sơ store gồm policy, listings, quyền/dữ liệu, reviewer, source/license, hình và hướng dẫn giữ dữ liệu theo ID.
- OCR đóng gói local-only/fail-closed, không CDN code/new Function; API Providers có disclosure trực tiếp OpenAI/chi phí/PDF trước nhập key. Không upload PDF gốc.
- 4.690 test đạt, 1 skip; 10 HTML pane assertions, 44 video production checks (YouTube mẫu 30s, ani.pm 15s, capture/audio thật và API mock), 32 PDF/OCR assertions offline bốn ngôn ngữ. Format/lint/build/audit 201 scripts đạt. Chưa đo API thật/chất lượng/cost hay full 10 phút capture; Edge runtime chưa xác minh, không điều khiển Edge của người dùng. Chưa nộp store.
- ZIP được stage/copy manifest cuối vào ReadFrog-Edge-1.58.0A, kiểm hash 470 file, giữ ID/quyền/browser data. Chỉ Reload entry cũ, numeric 1.59.3.8.

[Bộ hồ sơ store](https://github.com/dimayvegio/read-frog/tree/v1.59.3A.8/store) · [Privacy](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.8/PRIVACY_POLICY.md) · [Thay đổi và giới hạn](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.8/HTML_FIXED_PANE_AUDIO_A8.md).

SHA-256 ZIP: `5f6fbb7037d6db2ecbea5875a15fca9432b8ded8ea2e5f0ac339f4f05017908f`. Corresponding GPL source at the exact tag/GitHub archives. No store submission performed.
