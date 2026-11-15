# A.16 — Tạo PDF ảnh dịch bằng OpenAI

Package `1.59.3-a.16`, manifest numeric `1.59.3.16`, display `1.59.3A`. Bổ sung trên A.15; không đổi schema/migration/config hoặc quyền và không thêm dependency.

## Cách dùng

Mở tài liệu trong PDF Reader → **Tạo PDF ảnh dịch** → nhập **Từ trang / Đến trang** (ví dụ 1–4), ngôn ngữ/model/chất lượng/độ phân giải → **Tạo ảnh dịch các trang**.

PDF.js tạo một PNG nguyên trang trên máy, gửi ảnh trực tiếp đến OpenAI Images Edits rồi nhận PNG dịch. Dải 1–4 có bốn ảnh đầu vào và tối đa bốn yêu cầu tạo ảnh nếu chưa có cache. Chạy tuần tự, một trang đang xử lý. Không chạy local OCR/text translation/ASR, không gọi API khi mở khung, đổi trang xem/zoom hay tải kết quả.

- Xem từng ảnh OpenAI trả về, tải PNG riêng hoặc **Tải ZIP ảnh** (nguyên byte PNG, không tái nén ảnh).
- **Tải PDF** ghép các trang đã xong theo thứ tự gốc trên máy bằng pdf-lib. Giữ khổ vật lý/hướng trang lúc bắt đầu; ảnh fit vào trang không kéo méo, có thể có lề nếu model đổi tỷ lệ.
- PDF mới là **PDF ảnh**, không có lớp chữ chọn/tìm kiếm, liên kết hay ghi chú gốc. File PDF gốc giữ nguyên. Chưa tạo searchable PDF hay sửa nội dung vector.
- Khi dừng/lỗi, giữ ảnh hoàn thành; không tự retry hoặc tiếp tục trang khác. Bấm **Tạo / tiếp tục trang còn thiếu** mới xử lý phần còn thiếu, bỏ qua mọi trang đã xong trong cùng scope. Có thể xuất tập con đã xong, nút ghi rõ số trang.

## Scope, bộ nhớ và hủy

Tối đa 20 trang/lượt và 20 kết quả RAM/96 MiB ký tự dataURL trong session tài liệu. Kiểm tra chỗ trống cho phản hồi tối đa trước khi gọi trang kế tiếp; không âm thầm xóa ảnh đã tính phí để chạy tiếp. Chạm giới hạn thì dừng trước trang tiếp theo, tải kết quả rồi xóa/chọn dải ngắn hơn. Đây là giới hạn chuỗi/cache, không phải cam kết OS RAM tối đa.

Đóng/mở khung giữ ảnh đã xong; đóng tab/đổi tài liệu mất ảnh, hãy tải kết quả. Đổi ngôn ngữ/model/chất lượng/DPI hoặc **Xóa ảnh trong phiên** xóa session hiển thị và cache RAM chia sẻ; không tự gửi lại. Key tài liệu/rotation/DPI/model/quality/target/prompt/credential/clear epoch được kiểm trước khi tái dùng. Không ghi bitmap/PDF mới vào DB/settings/sync/history, không đổi các DB đã phát hành.

Đổi file hủy job và giải phóng ảnh; ownership được kiểm ngay trước/sau các bước bất đồng bộ, không chỉ đợi React unmount. Đổi ngôn ngữ/key/cache loại bỏ kết quả cũ, không gửi trang tiếp. Chụp scope config lúc bắt đầu để tránh vô tình tính phí theo ngôn ngữ mới giữa các await. Dừng/đóng khung/pagehide abort render và port; ảnh đến muộn bị bỏ. Dừng không hoàn tác phí trang OpenAI đã nhận. Export có job hủy riêng và tối đa hai object URL/60 giây, cleanup trên clear/close/file change.

Render dùng một canvas tạm riêng, không ảnh hưởng ba canvas đọc/native text/annotation; không gọi `page.cleanup()` lên page đang dùng chung. Mặc định144 DPI, tùy chọn96/200; tự giới hạn8 MP/cạnh4.096, PNG/dataURL12 MiB. Trang quá nặng dừng với lời nhắc giảm DPI trước khi gọi API. Rotation gốc cộng rotation view lúc bắt đầu, không sửa vị trí đọc hay source geometry.

## Quyền riêng tư và giới hạn

Chỉ gửi **ảnh toàn trang được chọn** đến fixed OpenAI Images Edits. Không upload binary PDF, tên/path file hoặc metadata tài liệu. Full-page mode có thể gửi cả phần đã loại trừ trong chế độ dịch theo đoạn; UI nêu rõ đây không phải redaction. Ghi chú/nét vẽ sidecar của FlowRead không được thêm vào ảnh gửi. Các cơ chế exclude của engine song ngữ vẫn giữ nguyên.

Port A.15 chỉ mở rộng allowlist từ đúng `image-translate.html` sang thêm đúng trusted top-frame `pdf-reader.html`, không cho mọi extension page/web/iframe. Private key vẫn ở background, fixed model/endpoint/prompt, bounded final-only PNG/timeout/no paid retry; reuse renderer/download raw output. Không tải PDF lên Files API/proxy hay dịch vụ khác. [Hợp đồng A.15](OPENAI_IMAGE_EDIT_A15.md).

OpenAI tự dựng ảnh có thể thay font/bố cục, sai chữ nhỏ hoặc số liệu. Không cam kết pixel-perfect hay tính chính xác tài liệu kỹ thuật; luôn đối chiếu bản gốc. Prompt/glossary của dịch văn bản không áp dụng. Giá là phí tạo ảnh cho từng trang; numeric usage giữ chi phí unknown khi chưa định giá mixed image/text tokens đúng.

## Bảo toàn khi nâng cấp

Giữ class `PdfImageSession` tuần tự/explicit resume, scoped RAM reuse, reserve trước billing, partial export và stale-owner guards. Giữ source-only local raster + raw image output; không tự thêm OCR/text API/paid repair. Không mở rộng port ra mọi extension page; không thêm PDF binary vào provider payload. Giữ chính xác source page sizes/rotation và không remount native keyed PDF host.

Các file chính: `src/entrypoints/pdf-reader/image-translation.tsx`, `image-session.ts`, `image-pages.ts`; shared scope tại `src/utils/image-translation/generated.ts`. Kiểm production qua `scripts/debug/check-pdf-image-translation.mjs`, unit tại `pdf-reader/__tests__/image-session` và `image-pages`; chạy lại A.15 image-edit/PDF regressions khi merge.

QA dùng PDF.js/PDF/ZIP thật, OpenAI PNG giả lập, không có phí và không phải bằng chứng chất lượng model thật. Số liệu/artifacts cuối ghi trong `store/VALIDATION.md`.
