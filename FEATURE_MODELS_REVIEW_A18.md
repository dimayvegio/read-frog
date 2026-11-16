# A.18 — Review cấu hình model, dịch ảnh và FlowRead

Baseline: `24277883` (A.17). Package `1.59.3-a.18`, manifest `1.59.3.18`, display `1.59.3A`.

## Những thay đổi được giữ

- Hoàn thiện nhãn FlowRead ở các trang, menu, báo cáo và HTML ôn từ vựng. Giữ nguyên extension key, tên DB, ID menu, định dạng export và migrations để không mất dữ liệu cũ.
- Cấu hình model riêng cho dịch web/PDF, vùng chọn, giải thích/tóm tắt, phụ đề, OCR ảnh và mặc định tạo ảnh. Thêm yêu cầu riêng cho trang tạo ảnh và overlay. Xem ảnh có vừa khung/vừa chiều rộng/zoom.
- Menu chuột phải trên ảnh mở trang Dịch ảnh. Không tự gửi ảnh hay gọi AI.

## Lỗi đã sửa khi review

1. **Model thực thi lệch cache (P1).** Bản đầu đổi model trong background sau khi caller đã tạo cache key. A.18 giải quyết model trước cache/payload; background luôn dùng snapshot caller gửi. Cache HTML AI thêm effective provider; PDF/image/page/subtitle dùng cấu hình thực tế trong các cache có sẵn. Không đổi DB schema.
2. **Model âm thanh không tương thích endpoint (P1).** Không dùng chung danh sách audio/transcribe/live cho chấm phát âm hoặc SRT. Giữ các model cố định đã kiểm thử của từng tác vụ. UI giải thích rõ: chấm phát âm `gpt-audio-1.5`, text `gpt-transcribe`, SRT `whisper-1`, live `gpt-live-transcribe`. Chưa mở chọn model tùy ý cho các đường audio này.
3. **Mất cấu hình/không lưu model custom (P2).** Model custom rỗng từng bị schema từ chối nhưng UI nuốt lỗi; thao tác nhanh có thể ghi đè hàng khác. Đổi sang draft + Lưu rõ ràng, validate ID/nhiệt độ, hàng đợi functional writes đọc lại trạng thái lưu và báo lỗi. Giới hạn 8 feature keys, ID128 ký tự, catalog1000 ID; không sửa config125/sync transport.
4. **Tải model không giới hạn/khác khóa (P2).** GET cố định `/v1/models` chỉ từ options top-frame hợp lệ, timeout15s, tối đa1MiB, phản hồi chỉ ID hợp lệ và trạng thái an toàn. Hủy body thừa, kiểm lại credential revision. Danh sách account không chứng minh endpoint compatibility; catalog ảnh vẫn allowlist A.17, model text khác phải nhập chủ động. Không tự chọn model mới.
5. **Chọn nhầm ảnh/nguồn khác (P1).** Bỏ dò ảnh Twitter/ảnh lớn nhất và fetch ảnh không giới hạn có credentials. Chỉ đọc đúng ảnh đang tải trong frame đã chọn. Nếu canvas bị CORS/protected, kiểm lại tab/URL trước và sau screenshot rồi mở **crop thủ công**. Screenshot fallback không được tự chọn toàn ảnh; không tự gọi OCR/API.
6. **Giao diện/ảnh cũ (P2).** `[hidden]` có thể bị CSS flex ghi đè; zoom lớn có thể mất mép trái/trên; so sánh ảnh gốc từng dùng kích thước ảnh output. Giữ hidden thật, safe centering, kích thước gốc thật. Sửa prompt làm bỏ kết quả cũ; capture load lỗi hoặc bị thay thế không được chọn FULL trên ảnh khác. Mặc định imageEdit dùng allowlist đồng nhất ở trang ảnh/PDF, không có async init ghi đè model người dùng vừa chọn.
7. **OCR/overlay (P2).** Gộp dòng chỉ trong cùng paragraph OCR, cùng cột, dừng ở đường kẻ; giữ newline, cap256 trước bước layout và bounded lookahead/sampling. Bỏ repaint khoảng trống ngoài word masks và phần clip tràn destination box. Giữ Unicode NFC/line spacing, alpha/raw PNG và cảnh báo fit; nền phức tạp vẫn chỉ gần đúng. Prompt bổ sung bounded4000 ký tự, nằm trong cache identity; ràng buộc ngôn ngữ/ID được nhắc lại cuối prompt.
8. **Regression compile.** Giữ copy BufferSource của sync vì Uint8Array<ArrayBufferLike> không thỏa kiểu stream DOM hiện tại. Cập nhật ca hủy selection chờ đúng thời điểm glossary thực sự pending và các kỳ vọng tên file theo branding mới.

## Áp dụng cấu hình và giới hạn

- Mỗi document/tab giữ một snapshot model bất biến đến khi **tải lại tab**. Sau khi Lưu/Đặt lại trong Options, tải lại các trang đang dịch/Reader để áp dụng. UI ghi rõ điều này; không tự gọi lại AI hoặc thay model giữa job/cache. Các tác vụ nội bộ trong worker lấy preference ở đầu tác vụ và giữ kiểm tra sau await.
- Ánh xạ hiện tại: dịch vùng chọn HTML/input → Selection; dịch PDF (kể cả đoạn chọn) → Web/PDF; dictionary/custom action và các khung giải thích/tóm tắt → AI explanation; caption → Video; OCR → Image. Giọng TTS không đổi theo model văn bản.
- Các lựa chọn này chỉ trong local storage riêng, **chưa nằm trong Edge sync hoặc backup cấu hình**. Không thêm credentials vào storage/sync. Không đổi published config, DB, ZIP vocabulary/report formats.
- Đổi imageEdit trong Options chỉ đổi mặc định khi mở lại trang; lựa chọn model/quality/size/prompt trực tiếp trong job vẫn là snapshot có thẩm quyền. Dự toán A.17 vẫn offline, output-only, không phải hóa đơn.
- Giữ mọi giới hạn A.15–A.17: ảnh/crop chỉ gửi sau hành động rõ ràng, private endpoint/key, bounded RAM/cache, raw PNG, PDF raster từng trang và ghép local; **không upload PDF binary**, không retry có phí, không telemetry/updater/provider khác.
- Danh sách model: [OpenAI Models API](https://developers.openai.com/api/reference/resources/models/methods/list). Tác vụ file và timestamp là hợp đồng riêng: [Speech-to-text](https://developers.openai.com/api/docs/guides/speech-to-text). Đối chiếu 16/11/2026; không suy ra chất lượng/model compatibility từ tên.

## Kiểm thử

Bằng chứng trong `.codex/review-a18/`, kiểm thử browser dùng profile Chrome riêng và synthetic fixtures/API mocks; không điều khiển Edge đang dùng. Xem `store/VALIDATION.md` để biết lần chạy và kết quả cuối. Không coi mock là bằng chứng chất lượng AI/live billing, không tuyên bố soak120 phút hoặc site live DRM/account đã chạy.

Các test mới bảo vệ cache/model snapshot, custom/default advanced settings, catalog bounds/key races, OCR paragraph/rule boundaries; production HTML fixed-pane có chế độ `FLOWREAD_FEATURE_MODELS=1` thao tác form thật và kiểm model trong payload, cache reuse. Standalone image kiểm hidden/zoom origins.
