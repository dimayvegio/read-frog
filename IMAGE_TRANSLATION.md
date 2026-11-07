# Chụp vùng và dịch ảnh

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
