# PDF dài, dải trang và kiểm soát dữ liệu — a.7

Package `1.59.1-a.7`, manifest `1.59.1.7`, display **1.59.1A**.
Bắt đầu từ local HEAD `2a4460bf`, nhánh `codex/upstream-1.59.1-openai`.
Upstream vẫn `v1.59.1` / `56d05e33`; config125, AppDB7, không merge upstream mới.

## Đã sửa và cách dùng

- Thanh trên: mở tài liệu, song ngữ/chụp ảnh, trang đầu/trước/sau/cuối,
  zoom10–400% (nhập tùy ý, vừa rộng/vừa trang), toàn màn hình, **Trích trang**, **In**.
  Không thêm nút tải PDF gốc. Thanh dưới: ba icon nhỏ tìm/mục lục/bookmark,
  chọn chữ/kéo trang/chỉnh hình, vẽ, màu, tô sáng/gạch chân, undo/redo, chú thích,
  OCR, dịch đoạn chọn, xuất PDF có chú thích. Giữ nguyên các công cụ a.5/a.6.
- **Trích trang**: nhập `1-10, 30-35, 42`, đặt tên rồi **Tạo PDF mới**.
  `1-10, 3-30` tạo30 trang1–30. Bỏ trùng, giữ thứ tự nhập, không sửa file gốc.
  Giới hạn2.000 trang/lượt, file đầu vào/đầu ra200MiB. Worker riêng, một
  `copyPages` để chia sẻ font/ảnh; Dừng/đóng/thay file sẽ terminate worker.
  Tài liệu mới lấy trang gốc; sidecar bookmark/OCR/bản dịch/ô chữ local không
  chuyển theo hash mới. PDF được bảo vệ mà pdf-lib không mở được sẽ báo lỗi.
- **In**: chọn kèm chú thích/ô chữ → **Chuẩn bị bản in** → **In ngay**.
  Bản in là blob local, không raster toàn bộ tài liệu để tránh giữ hàng trăm
  canvas. Nếu browser chặn lệnh in iframe, **Mở bản in ↗**, rồi `Ctrl+P`.
  Hộp in gốc của browser chọn máy in/dải trang. Không tự gửi lệnh tới máy in.
- **Ô chữ**: chọn icon ô chữ, bấm trên trang, nhập Unicode, chọn màu/cỡ chữ,
  lưu; kéo thân/chốt góc để đổi vị trí/kích thước; bấm đúp/Enter để sửa, Delete
  để xóa. Mỗi gesture có một CAS/revision/undo, preview không ghi DB.
  Khi xuất/in, chữ được vẽ thành PNG trong PDF để giữ dấu Việt/CJK mà không
  tải font ngoài; phần chữ chèn này không trở thành native searchable text.
- **Gạch chân**: bôi đen rồi bấm icon gạch chân; lưu như ink cũ, dùng chung
  màu/chỉnh sửa/undo/export. **Alt+Enter** dịch phần đang bôi đen trong trình
  đọc Read Frog qua đúng đường dịch hiện có. Phím này không chạy trong ô nhập,
  chế độ vẽ/kéo trang, hay trình xem PDF native của Edge.
- **Tìm kiếm**: preset Userguide / Datasheet / RTL–DV; case, nguyên từ/tên,
  bỏ dấu, bỏ khoảng trắng, wildcard tùy chọn, cụm từ/AND/OR, AND gần nhau
  200/1.000 ký tự và dải trang. `data[31:0]`, `8'hFF`, `$`, `_`, dấu chấm tên
  phân cấp được tìm literal. Tắt wildcard để tìm dấu `*`. Không chạy regex
  tùy ý. Kết quả riêng từng vị trí, chọn để nhảy, `F3`/`Shift+F3` tiến/lùi.
  Folding chỉ dùng tìm kiếm, không thay source hay payload dịch.
- **OCR trên máy**: nhập từ/đến, tối đa100 trang/lượt tuần tự bằng một worker.
  Cache mới tối đa500 trang/file,3.000 trang tổng, RAM LRU6 cây từ/geometry.
  Giữ bộ đọc OCR cũ20 trang của Study DB1; không sửa format đó. Chuyển trang,
  đổi file/đóng/hủy sẽ dừng OCR; clear epoch/CAS chặn ghi muộn.
- **Song ngữ → Dịch dải trang**: từ/đến, tối đa100 trang/lượt, có Dừng, cache
  chung của các đoạn/trang; đọc tuần tự một text layer tạm, không thêm canvas
  đọc hoặc giữ toàn bộ transcript tài liệu. Trang không có chữ được bỏ qua,
  không tự OCR/đẩy ảnh/OpenAI. Có thể đọc trang khác trong khi dải chạy; đổi
  file/đóng song ngữ/đổi cấu hình hoặc cách chia đoạn sẽ hủy phần còn lại.
- **Chỉnh đoạn → Xóa phần nhận diện**: xóa card/overlay khỏi danh sách dịch,
  giữ PDF gốc. Undo hoặc Khôi phục chia tự động để lấy lại. Không gọi provider.
- Adapter `pdf-layout-cells-v1` giữ số dòng/ô và separators bằng mã ứng dụng.
  OpenAI nhận các ô đánh chỉ số và trả một JSON có đủ ID, không trùng/thừa,
  không chèn newline/tab trong một ô. App lắp lại nguyên layout chữ; sai mẫu
  thì dừng, không cache/không tự gọi sửa có phí. Streaming hiển thị ô hoàn tất,
  không hiển thị JSON thô. Chuẩn hóa Unicode không nối dòng hay nối từ gạch
  ngang. Bản dịch dài có thể xuống dòng mềm theo chiều rộng panel; đó là wrap
  hiển thị. Chia tự động của PDF vẫn là heuristic; bảng scan phức tạp có thể
  cần chỉnh đoạn/chọn chữ, không hứa tái dựng bảng như phần mềm dàn trang.

## Dữ liệu và tài nguyên

`read-frog-pdf-workspace` DB1 đã phát hành giữ nguyên khai báo `.version(1)`
và record documents. **DB2 additive** thêm `textNotes` (format1,500 ô/file,
100 file,1M JSON chars/file), `ocrPages` (format1, compound `[docId+page]`,
2M JSON chars/trang), `ocrEpochs` (format1). Không sửa Study DB1, PDF DB2,
config125, Edge sync, vocabulary/ZIP/report hoặc migration cũ. Dữ liệu mới
ở local IndexedDB, không tự đưa vào đồng bộ/backup cấu hình. Text notes dùng
chung bounded undo50/8M với workspace a.6 nhưng CAS riêng từng store.

PDF vẫn tối đa20.000 trang/200MiB, ba reading canvas, lazy measured page
geometry và text LRU8M UTF-16 units/2.048 trang. Search dừng có thông báo ở
1.000 kết quả hoặc20M ký tự quét; thu hẹp dải để đọc phần còn lại. OCR mới
không gom geometry của500 trang vào một object. Danh sách khóa OCR số trang
chỉ nạp một lần để tránh1.200 lượt IndexedDB read vô ích trên PDF native.

## Chính sách mạng theo yêu cầu mới

Yêu cầu chỉ dùng OpenAI thay thế lựa chọn giữ Microsoft TTS trước đây:

| Luồng                                                                 | Ra mạng                                                                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Mở PDF local, đọc/cuộn/zoom, tìm, bookmark, vẽ/ô chữ, trích trang, in | Không                                                                                                    |
| OCR local Tesseract                                                   | Không; worker/WASM/ngôn ngữ đóng gói sẵn                                                                 |
| Bấm dịch PDF/song ngữ/dải trang                                       | Chỉ chữ của phần được chọn tới OpenAI Responses                                                          |
| Bấm OCR ảnh OpenAI                                                    | Chỉ crop ảnh đã chọn tới OpenAI; không gửi binary PDF                                                    |
| Dịch web/từ điển/phụ đề/học, TTS, chấm phát âm, audio transcription   | Endpoint OpenAI cố định, private credentials; không relay                                                |
| Microsoft/Edge TTS                                                    | Đã tắt handler mạng và bỏ client khỏi production graph; setting cũ vẫn đọc được, runtime dùng OpenAI     |
| Site rules từ rules.readfrog.app                                      | Tắt; xóa alarm cũ, dùng rules trong ZIP                                                                  |
| Icon                                                                  | Offline inventory; thay các import Iconify online còn sót sau upstream                                   |
| Native CC                                                             | Vẫn GET phụ đề từ website gốc đang xem, cần cho YTB/Netflix/ani.pm; không gửi PDF                        |
| Mở PDF bằng URL                                                       | GET URL người dùng mở để tải file xuống reader; không upload                                             |
| Edge account sync đã bật                                              | `browser.storage.sync` cấu hình nhỏ; browser/Microsoft quản lý vận chuyển, không gồm PDF/key/audio/sổ từ |

Không tuyên bố browser hoặc website đang mở không phát sinh kết nối mạng.
Không có PDF upload endpoint, Files API, dịch vụ PDF relay, Drive/OneDrive
upload trong reader. Source title/path không được thêm vào prompt dịch.
URL endpoint provider chỉ OpenAI; không dùng baseURL tùy ý từ import cũ.
Các URL provider cũ trong migration đóng băng và code Microsoft chưa được
bundle không có nghĩa runtime gọi chúng. Xem `scripts/debug/audit-runtime-network.mjs`.

## Kiểm thử và giới hạn

Đã kiểm thử production **245 kiểm tra**: controls20, workspace23, UX60,
study/OCR29, bilingual33, reading/image/history80. Có fixture PDF thật ALCHIP
read-only, fixture kỹ thuật, OCR bốn ngôn ngữ, trích trang/print blob, Unicode
ô chữ/undo, Alt+Enter, payload-only-text/no HTTP trên reader local. Unit test
DB2 nâng từ DB1,25 trang OCR (vượt giới hạn cũ20), LRU6/clear/CAS, parser
range/search/structured row IDs và routing TTS legacy. Static audit **199
script** trong production không chứa endpoint Microsoft TTS/rules server/icon
CDN/relay đã cấm. Có regression test tắt handler Microsoft không gọi fetch.

Benchmark sequential, **3 lần mỗi bản**, cùng Chrome157/profile mới/fixture
hash, không gọi OpenAI. Mỗi bản chạy xong mới chạy bản sau; không chạy test
khác đồng thời. Trung vị:

| Chỉ số                                    |       a.6 |       a.7 |
| ----------------------------------------- | --------: | --------: |
| Mở PDF native1.200 trang                  |   222,2ms |   218,6ms |
| Cold search, phải trích chữ toàn tài liệu | 1.030,0ms | 1.029,2ms |
| Warm search,9 lượt/3 run                  |    24,4ms |    26,2ms |
| OCR8 trang                                | 5.274,7ms | 5.412,2ms |
| JS heap sau search (GC)                   |  17,00MiB |  17,20MiB |
| Peak OS working set toàn browser thử      | 991,18MiB | 950,80MiB |

Tốc độ mở/cold search gần như giữ nguyên, warm search/OCR hơi chậm hơn ở mẫu
này; không khẳng định tăng tốc model hay giảm RAM JS. OS peak giảm khoảng4,1%
trong phép đo nhưng gồm nhiều process, PDF/WASM/canvas/cache của browser và
nhiễu hệ điều hành, không phải RAM riêng extension. Mở rộng chính là OCR100
trang/lượt và500 trang cache/file, so với20 trước đây, trong khi RAM geometry
vẫn bounded6. Bằng chứng local `.codex/pdf-performance-a6-before-a7-1794422825398`
và `.codex/pdf-performance-a7-after-1794422868770`, fixtures native SHA256
`73a5443483b6790549057c528fed136173abdd4878bd17d7846d732ca8f8a546`, scan
`3a09b3cf3ac897fa468aa489ccd91435fd40e84b76d07058a4c6e541ddcc43cd`.

Full suite: **4.558 test pass,1 skipped**; `SKIP_FREE_API=true`, live free API
suite excluded. Type-aware lint/type-check và formatter đã qua. ZIP rebuild
có **468 file hash giống hệt build đã chạy production**, audit endpoint199
scripts vẫn qua. Build cảnh báo chunk lớn và locale az chưa hỗ trợ như cũ.

ZIP22.018.240 bytes, SHA256
`3271e5fab8475e1c1aaa05cf19e624d3997c84b4d2d8a5997fa8ebd56c2a53a5`.
So ZIP a.6 tăng171.677 bytes (khoảng0,79%); uncompressed45,68MB. Đã validate
root manifest/safe paths/CRC/key/quyền/hash rồi giải nén staging riêng, copy
assets/entrypoints trước, manifest cuối vào đúng thư mục cố định
`C:\Users\TIEN\Downloads\ReadFrog-Edge-1.58.0A`. Cả468 file installed
khớp ZIP, key/quyền giữ nguyên; không xóa/move thư mục hoặc chạm browser data.
Delivery một ZIP `C:\Users\TIEN\Downloads\ReadFrog-Edge-1.59.1A.zip`.
Báo cáo filesystem `.codex/extension-update/20261111T185114Z-b3754604/update-report.json`.
Người dùng **Reload entry hiện tại**, xem numeric1.59.1.7/display1.59.1A.
Không kiểm tra/control Edge thực tế để cập nhật local. Không có phần bị chặn;
những giới hạn live model/máy in được ghi rõ dưới đây.
Production dùng Chrome riêng/profile thử, provider giả lập, không dùng key
thật, không đọc/control Edge của người dùng. Chưa đánh giá chất lượng/độ trễ
model OpenAI live, chưa in ra giấy hoặc kiểm thử mọi PDF mã hóa/hỏng/bảng scan.
