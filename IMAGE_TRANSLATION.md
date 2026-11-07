# Chụp vùng và dịch ảnh

## Cập nhật 1.58.0-a.13 / manifest 1.58.0.14

Tiếp tục từ `f4737d6c`, giữ tên **1.58.0A**, config124, PDF DB2 và vocabulary
DB4/ZIP5/report3. Không sửa migration đã phát hành. Cập nhật bằng ZIP ghi đè
đúng thư mục extension cũ rồi Reload; giữ ID/thư mục để giữ key và sổ từ.

- Mặc định **Nhanh — một lượt**: OpenAI nhận crop, trả chữ gốc và bản dịch
  bằng structured output trong một request. Chữ/bản dịch hiển thị dần; chỉ
  nhận kết quả hoàn chỉnh đúng schema và giới hạn. Khung kết quả dùng lại
  copy/TTS/lưu từ, không gọi dịch lần nữa nếu fingerprint vẫn khớp.
- **Đọc chữ trước — hai bước** giữ đường OCR rồi engine dịch cũ. Nếu glossary
  đang bật và có thuật ngữ toàn cục, hoặc prompt khác Default, tự dùng hai
  bước dù đang chọn Nhanh; lý do hiện trong trạng thái. Không đổi model/key.
- Cache tự bật cho OCR, cặp một lượt và text dịch sau OCR, tách key từng loại.
  OCR tái dùng khi đổi ngôn ngữ đích; bản dịch phải xét target, prompt hiệu
  dụng, model/reasoning/temperature, credential revision và tùy chọn làm sạch.
  Fast key còn xét instructions thực tế, ảnh crop và glossary. Đổi cấu hình
  không dùng nhầm bản cũ; đổi thứ tự thuộc tính options không gây cache miss.
- **Đọc lại ảnh** bỏ qua cache OCR/fast cho lượt đó; **Regenerate** trong
  khung dùng engine text và bỏ qua cache text. Sửa chữ rồi **Dịch lại văn bản**
  dùng key text mới, không gửi ảnh lại. Fast và text hai bước không dùng lẫn
  kết quả cache; muốn tạo lại cặp fast dùng Đọc lại ảnh.
- **Xóa cache ảnh** xóa OCR/fast/text cache, không xóa PDF history, key, sổ từ
  hoặc tiến trình học. Xóa trong lúc đang chạy hủy UI; epoch ngăn ghi lại muộn
  kể cả từ tab khác. Lỗi/rỗng/cắt ngắn/quá giới hạn/hủy không được cache.
- **Alt+Shift+S** là shortcut gợi ý của `capture-and-translate`. Browser phải
  đang có focus; không đăng ký global trên toàn Windows. Đọc binding thật
  bằng commands.getAll, hiển thị trong popup và editor. Bấm nhãn để mở phần
  phím tắt; nếu xung đột/chưa gán thì đổi tại `edge://extensions/shortcuts`.
  Khi command capture thất bại, mở trang paste với hướng dẫn Win+Shift+S;
  không tự gửi ảnh hoặc tự gọi API chỉ do bấm phím tắt. Chống giữ phím lặp.

DB riêng `read-frog-image-cache` **v1** (`entries`, `meta`) chỉ lưu hash,
kind, chữ gốc/bản dịch, thời gian và byte ledger; không chứa ảnh, URL/path,
provider config hoặc credential. **Tổng500 record /16 MiB /TTL30 ngày**, LRU
tự loại entry cũ. Một ảnh hai bước có thể dùng hai record. Mode preference
`imageTranslationMode` nằm riêng trong storage.local, không đổi config schema.
Cache không nằm trong settings backup/notebook ZIP; ảnh vẫn chỉ ở RAM tạm.
TTL là hạn tái sử dụng; entry hết hạn được dọn khi cache được đọc/ghi tiếp.
Định nghĩa DB1 mới phải đóng băng sau phát hành. Hai bước vẫn có giới hạn OCR
20.000 ký tự; fast có original≤20.000, translation≤60.000, token budget16.000
và không chấp nhận output bị cắt. Model fast cần hỗ trợ cả vision và structured
output; model không hỗ trợ có thể chọn hai bước, không tự retry mất thêm lượt.

Đối chiếu tốc độ với ZIP a.12 được làm bằng cùng browser/ảnh/model cấu hình,
20 lượt mỗi trường hợp, xen kẽ để giảm ảnh hưởng thời điểm. API giả lập200 ms
mỗi request, IndexedDB/crop/runtime/UI thật; không đo chất lượng hoặc thời
gian sinh token của OpenAI. Xem [báo cáo số liệu](IMAGE_TRANSLATION_BENCHMARK.md).

Artifact cập nhật `ReadFrog-Edge-1.58.0A-FastImage.zip`: **416 file /8.703.575
byte**, tăng **3.698 byte** so với a.12. Kiểm CRC và từng file khớp build đã
test; không có profile/fixture/test key/`.env`/sourcemap/Node binary trong gói.
SHA-256: `310D47923B7539BE8AB7258FE74AC59F49D9DBDF99E595B4CF800ABAEBBA8AE1`.
HTML ôn từ giữ SHA-256
`301315CED603BDCB46649DBC63E57B529AEA866414123FD1392BFEF55405DDFF`.

## Bản trước 1.58.0-a.12 / manifest 1.58.0.13

Build `1.58.0-a.12`, manifest `1.58.0.13`, hiển thị **1.58.0A**, tiếp tục từ
`83b1e454` trên nhánh `codex/pdf-reading-panel`. Không đổi config124, PDF DB2,
vocabulary DB4/ZIP5/report3 hoặc migration đã phát hành.

## Cách dùng

- Trong popup extension, bấm **Chụp vùng & dịch ảnh**. Tab nguồn được chụp một
  lần, rồi mở tab Dịch ảnh. Kéo chọn vùng chữ hoặc bấm **Toàn ảnh**, sau đó bấm
  **Đọc chữ và dịch**. Chụp/xem/chọn vùng chưa gọi API.
- Trong trình đọc PDF Read Frog, có cùng nút chụp ngay trên thanh công cụ. Nó
  lấy phần PDF đang hiển thị từ canvas đã render, kể cả trang scan không chọn
  được chữ. Không cần bẻ khóa text layer của Edge native hoặc upload cả PDF.
- Với PDF native hoặc trang Edge chặn capture, dùng **Win+Shift+S**, rồi bấm
  **Dán / mở ảnh có sẵn** trong popup và **Ctrl+V** tại tab Dịch ảnh. Có thể
  kéo thả hoặc **Mở ảnh** PNG/JPEG/WebP. Chụp file URL trực tiếp cần bật
  **Allow access to file URLs**; giao diện luôn báo lỗi và cho cách dán ảnh khi
  capture bị từ chối. Không tự chuyển sang chụp màn hình nền.
- Sau khi nhận dạng, chữ gốc có thể sửa trong textarea rồi **Dịch lại văn bản**.
  Dịch lại chữ không gửi lại ảnh. **Dừng** hủy OCR; đổi ảnh/vùng hủy kết quả cũ.
  Khung dịch dùng lại ngôn ngữ, streaming, copy, TTS Microsoft/OpenAI và lưu từ
  hiện có. Đóng khung hoặc đổi kết quả dừng stream/giọng đang đọc.

Chọn model OpenAI có khả năng nhận ảnh trong cấu hình hiện tại. Không tự đổi
model hoặc credential. Một lần **Đọc chữ và dịch** chạy hai request: vision
đọc nguyên văn, sau đó engine dịch văn bản hiện có áp dụng prompt/glossary
chung. Đây là OCR bằng AI, có thể đọc nhầm; người dùng có ô sửa chữ. Ảnh rỗng,
OCR lỗi, output bị cắt hoặc quá20.000 ký tự không tự chuyển sang dịch một phần.

## Dữ liệu và giới hạn

- Full screenshot chỉ giữ tạm trong RAM background, chuyển một lần qua UUID
  opaque trong URL, tối đa2 ảnh chờ. Channel hết hạn sau5 phút hoặc sớm hơn
  khi MV3 worker dừng. Reload tab sẽ cần chụp/dán lại. Không lưu ảnh vào
  `storage.local/session`, IndexedDB, backup settings, sổ từ hoặc cloud.
- Popup mới được gọi capture API. Reader mới được gửi canvas PDF; trang web,
  subframe và extension khác bị từ chối. Nếu tab nguồn thay đổi trong lúc
  chụp thì bỏ ảnh, yêu cầu chụp lại. Image stream port chỉ chấp nhận trang
  `image-translate.html` cùng extension, top frame.
- Chỉ crop cuối đi qua private credential runtime tới
  `https://api.openai.com/v1/responses`. Không gửi URL/path/file title hoặc
  vùng ngoài crop trong prompt. Không nhận remote image URL hoặc SVG trong
  payload. Text trong ảnh được coi là dữ liệu, không phải chỉ dẫn thực thi.
- File ảnh tối đa20 MiB; screenshot tạm tối đa32 MiB dạng data URL. Canvas
  editor tối đa12 triệu pixel/cạnh6.000; crop gửi tối đa8 triệu pixel/cạnh
  4.096, data URL PNG/JPEG tối đa12 MiB. Ưu tiên PNG, dùng JPEG chất lượng0,92
  nếu PNG quá lớn. Crop quá nhỏ bị từ chối, mapping theo kích thước ảnh thật,
  không giả định DPR hoặc zoom cố định.
- Giữ key ở credential store cũ. Ảnh/OCR không tự lưu lịch sử PDF. **Lưu để
  học** vẫn lưu từ/ngữ cảnh đã nhận dạng khi người dùng chủ động chọn; không
  gắn ảnh vào notebook. HTML ôn từ không cần thay.

Định dạng vision được đối chiếu với [OpenAI Images and vision](https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses)
và tài liệu AI SDK đi kèm version đã cài; capture theo
[Chrome tabs.captureVisibleTab](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab).
Worker dùng inline image qua `type:file`, `imageDetail:high`, không CDN hoặc
dịch vụ OCR bên thứ ba. `activeTab` dành cho lượt mở popup; `<all_urls>` giữ
khả năng dịch site và cho phép capture web thông thường. Cả hai không bỏ
qua việc người dùng cần chủ động bấm nút chụp.

## Kiểm chứng

`scripts/debug/check-pdf-reading.mjs` giữ regression native/reader và gọi
`check-image-translation.mjs` trong production Edge, profile riêng, API mô
phỏng. Có screenshot web thật, crop kéo ngược ở DPR2, kiểm pixel crop gửi đi
loại vùng màu bên ngoài, hai request OCR/dịch, sửa OCR chỉ gọi text, paste
PNG qua ClipboardEvent, file input, Stop/response trễ, OCR rỗng/quá giới hạn,
canvas PDF và các viewport390/760/1280. ClipboardEvent dùng PNG thật nhưng
không tự bấm Win+Shift+S của Windows.

Unit test kiểm sender/channel one-shot/TTL/quota RAM, tab đổi khi chụp, không
ghi storage, schema ảnh, mapping DPR độc lập, private snapshot/stream port.
Các bộ kiểm tra vocabulary và scale1.000 từ vẫn phải đạt trước phát hành.

**Đã sửa:** chụp/crop, paste/file/drop ảnh, OCR OpenAI, sửa chữ/dừng, khung
dịch dùng chung, nút truy cập từ reader và quyền capture cần thiết.
**Chưa kiểm thử:** chất lượng OCR/dịch với API OpenAI live, thao tác snipping
OS thật, toàn bộ model nhận ảnh, DRM/video bảo vệ hoặc mọi loại PDF scan.
**Bị chặn:** không có blocker triển khai; trang cấm capture dùng paste/file.

**Đã kiểm thử 07/11/2026:**4.087 source test đạt /1 bỏ qua, live free-api
loại với `SKIP_FREE_API=true`. Lint/type-check/format/build đạt. Production
Edge156.0.4314.58 có58 assertion PDF/ảnh (gồm39 của luồng PDF cũ), native
local PDF capture thật đạt; vocabulary68 và scale1.000 từ25 assertion đạt.
Đã xem ảnh giao diện desktop/390px; controls dùng token theme đúng, result
không overflow390/760/1280. OCR/Responses dùng API mô phỏng, không dùng key thật.

Artifact `ReadFrog-Edge-1.58.0A-ImageTranslation.zip`:415 file,
**8.699.877 byte**, tăng8.892 byte so với AutoPDF. Đã kiểm CRC và đối chiếu
từng file với build chạy browser; không có test key/profile/fixture, `.env`,
sourcemap hoặc Node canvas binary. SHA-256:
`444D55A09D700DC8A384C7EC1AE42A4F083086346B5E0AB4AC6C7974C92754BF`.
HTML ôn từ giữ nguyên SHA-256
`301315CED603BDCB46649DBC63E57B529AEA866414123FD1392BFEF55405DDFF`.
