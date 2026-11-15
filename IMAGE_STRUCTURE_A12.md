# FlowRead A.12 — OCR ảnh giữ cấu trúc

Baseline `1da3aa02` / A.11. Package `1.59.3-a.12`, manifest `1.59.3.12`, display `1.59.3A`.

## A.13 — chỉ có bảng/code vẫn hiển thị đúng

Bản `1.59.3-a.13` / numeric `1.59.3.13` sửa lỗi phát hiện khi chụp ví dụ: heuristic Markdown chung không nhận biết output chỉ có bảng hoặc code. Với `imageStructure`, khung kết quả luôn dùng renderer cấu trúc an toàn, không cần có heading/list để kích hoạt. Không thay plain translation, request/cache/prompt hoặc dữ liệu. Thêm hai UI regressions table-only/code-only; hai ảnh chụp raw có source bitmap và bản dịch Việt giả lập, không phát sinh API thật. Chi tiết lần kiểm chứng trong store/VALIDATION.md.

## Cách dùng

Tại trang Dịch ảnh, chọn **Giữ cấu trúc — bảng, danh sách, code**, chọn vùng và bấm **Đọc chữ và dịch**. Nhớ mode riêng trong `imageTranslationMode`; mở trang/chọn mode/crop chưa gọi API. Hai chế độ plain cũ giữ đường cũ.

Nguồn có các khối tiêu đề, đoạn văn, danh sách, bảng thật và code monospace. **Sửa** nội dung/từng ô rồi **Lưu chỉnh sửa** hoặc **Hủy**. Đoạn văn liền nhau có thể gộp; trình sửa đoạn có tùy chọn tách tại dòng trống. **Bỏ khối** loại khỏi nguồn sẽ dịch, không bỏ khối cuối cùng. Sửa làm đóng/hủy kết quả cũ; bấm **Dịch lại cấu trúc** để cập nhật. Chỉnh sửa ở RAM tab, không viết đè OCR ban đầu.

Cold dùng một request vision và một text. Cùng crop/model/key dùng lại OCR; cùng cells/effective prompt/glossary/target/output settings/key dùng lại dịch. Sửa chỉ dịch text; đổi target không đọc lại ảnh. **Đọc lại ảnh** bypass OCR cho lượt đó; nguồn không đổi vẫn có thể dùng bản dịch cũ. **Tạo lại** ở khung kết quả bypass dịch text, không gửi ảnh. Code-only không cần lượt text dịch.

## Tham khảo mã nguồn mở

- [Docling](https://github.com/docling-project/docling): biểu diễn tài liệu có cấu trúc, tách reading order/table/code khỏi chuỗi OCR. Áp dụng nguyên tắc phân khối/thứ tự đọc.
- [PaddleOCR table structure recognition](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/module_usage/table_structure_recognition.en.md): nhận diện hàng/cột/ô là bước riêng. Áp dụng bảng chữ nhật và dịch từng cell.
- [MinerU](https://github.com/opendatalab/MinerU): tham khảo hướng output Markdown/JSON có cấu trúc.

Triển khai riêng bằng OpenAI vision đã chọn; không sao chép mã hoặc tích hợp Python/model/server của các dự án trên. Không có dependency, endpoint, permission mới. Không tuyên bố chạy layout engine Docling/PaddleOCR local trong extension.

## Hợp đồng để giữ khi nâng cấp

- `image-structure-v1`: OCR yêu cầu JSON typed blocks, strict local validation trước khi dùng. Tối đa 128 khối, 100 hàng/bảng, 24 cột, 2.048 cells, 20.000 ký tự JSON; Markdown nguồn cũng ≤20.000. Không nhận trường lạ, bảng lệch cột, newline trong cell/list item, code language tag không an toàn hoặc nguồn rỗng.
- App cấp ID theo block/item/row/cell. Dịch trả đúng mỗi ID một lần, không thiếu/trùng/thừa/rỗng hoặc đổi hàng/mục; output ≤60.000 ký tự. Thứ tự response không thay thứ tự nguồn. Code/ô rỗng không gửi vào lượt text, app giữ nguyên. Không hiển thị/cache JSON streaming chưa kiểm tra.
- Render chỉ từ cấu trúc app: text/cell được escape, code fence đủ dài kể cả source có backticks. Preview là React text nodes/table/pre; renderer chung giữ chặn ảnh và HTML model. Không tin tọa độ/style từ AI. Bypass nối dòng/làm sạch PDF cho nguồn cấu trúc. Giữ explicit target override kể cả custom prompt ghi cứng ngôn ngữ khác, glossary từ raw cells.
- Image DB1 không đổi version/schema: namespace mới dùng `original` string chứa source JSON đã validate, `translation` string chứa JSON cells đã validate; decode lại khi đọc. Plain cache cũ không dùng lẫn. Giữ ledger 500 records /16 MiB /TTL30 ngày, text/hash only. Code/numbering/type thay đổi nhưng cells dịch không đổi có thể dùng cùng cell translations rồi render theo nguồn hiện tại.
- Đổi file/crop/close hủy owner cũ; đối chiếu config identity/key revision/clear epoch sau async trước commit/hiển thị. Không cache partial/invalid hoặc tự paid repair/retry/fallback. Bỏ khối khỏi lượt mới không xóa cache/lịch sử cũ; dùng **Xóa cache ảnh** khi cần xóa chúng.
- Crop explicit đi trực tiếp fixed OpenAI Responses qua private runtime cũ. Ảnh chỉ RAM; không URL/path/title file, screenshot ngoài crop hoặc PDF binary. Không đổi model, config125, sync, PDF DBs, vocabulary/review HTML, wire/ZIP/report schemas đã phát hành. A.12 chưa thay OCR local PDF.

## Giới hạn

Giữ **cấu trúc nội dung**, chưa pixel-perfect font/màu/tọa độ/độ rộng cột. Reading order nhiều cột phụ thuộc vision model; có thể sai nên cần xem/sửa. Ô gộp được biểu diễn chữ ở trên-trái và ô trống phần còn lại, chưa giữ rowspan/colspan. Headerless table giữ dữ liệu nguyên hàng; Markdown có hàng header trống chỉ để trình bày. Danh sách phẳng, chưa phục dựng cây lồng nhau/inline typography/phương trình. Crop nhỏ hơn nếu quá phức tạp; lỗi không tự gọi paid repair.

## Kiểm chứng

4.764 unit tests đạt / một intentional free-service skip, 491 file đạt / một skipped; `SKIP_FREE_API=true`, log `.codex/image-structure-tests.log`. Kiểm source bounds, table shape, literal rendering, exact IDs, prompt/target/glossary, cache separation/reuse, excluded source, code/cache-only no calls, abort/config/key/clear guards và UI save/cancel/merge/split/delete.

`scripts/debug/check-image-structure.mjs` chạy actual edge-mv3 trong Chrome profile riêng: 22 checks cold 2/warm 0/edit 1 text, no image reupload, no provider từ edit, invalid reply không cache/retry, stop in flight, desktop/phone và raw screenshots. API giả lập; không chứng minh chất lượng OCR/dịch OpenAI live. `check-pdf-reading.mjs` hồi quy reader/image/fast cache: 83 checks trong Chrome. Edge launch riêng gặp TargetCloseError trước khi test nên không tính là Edge pass. Evidence và SHA cuối ở `store/VALIDATION.md`. Không đo OS RAM hoặc soak 120 phút.
