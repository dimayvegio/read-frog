# Đọc và dịch PDF local

## Tự nhớ vị trí — 1.58.0-a.11 / manifest 1.58.0.12

Tiếp tục từ `f823d780` trên nhánh `codex/pdf-reading-panel`, tên hiển thị
**1.58.0A**. Giữ config124, vocabulary DB4/ZIP5/report3; PDF DB lên **2** bằng
hai store mới, định nghĩa DB1 đã phát hành không đổi.

1. Giải nén ZIP mới đè đúng thư mục extension cũ rồi Reload tại `edge://extensions`.
2. Bấm **PDF** trong popup → **Đọc PDF và tự lưu vị trí**. Trình đọc Read Frog
   mở tab riêng. Nếu đang xem file PDF và đã bật **Allow access to file URLs**,
   có thể mở thẳng file từ tab nguồn; nếu không, bấm **Mở PDF trên máy**.
3. Cuộn/chuyển trang/đổi thu phóng sẽ tự lưu, không cần nhập bookmark. Mở lại
   cùng file tự về trang, vị trí trong trang và mức thu phóng đã đọc. Đổi tên
   hoặc chuyển thư mục vẫn nhận diện theo SHA-256 nội dung; sửa nội dung thành
   file khác sẽ tạo vị trí riêng. Không lưu bản sao PDF hoặc quyền file handle;
   phiên mới cần chọn lại file nếu channel tab nguồn không còn/hết 30 phút.
4. Bôi đen → **Dịch đoạn đã chọn** dùng cùng khung dịch hiện có: ngôn ngữ,
   streaming, làm sạch, lịch sử/cache, TTS Microsoft/OpenAI và lưu từ. Chỉ bôi
   đen hoặc đọc/cuộn không gọi OpenAI. Đóng khung dịch hủy stream/giọng đang đọc.
5. **Quên vị trí** xóa riêng vị trí của file, không xóa lịch sử dịch hoặc sổ từ.
   Cuộn tiếp sẽ tự lưu vị trí mới. Xóa lịch sử dịch cũng giữ vị trí đọc.

Tự nhớ vị trí chỉ hoạt động trong **trình đọc Read Frog**, không theo dõi số
trang của Edge native. Luồng dịch Edge native bên dưới được giữ nguyên.
PDF.js 6.5.438, worker, font, CMap và decoder đều đóng gói local, hoạt động
offline; không chạy script/action của PDF và không gửi toàn file lên server.
Giới hạn file **200 MiB / 20.000 trang**. Chỉ ba trang gần vùng đọc có canvas và
text layer, mỗi canvas tối đa 8 triệu pixel, DPR tối đa2; hủy và dọn trang cũ.
PDF có mật khẩu hỏi khi mở và không lưu mật khẩu. PDF scan hiển thị được nhưng
chưa OCR, nên ảnh không có text sẽ không bôi đen/dịch được.

DB2 thêm `positions` và `positionEpochs` trong `read-frog-pdf-reading`. Mỗi vị
trí lưu content hash, tên file, hash lịch sử, số trang/offset/zoom và thời gian;
không lưu đường dẫn, byte PDF, key hay password. Save qua background, debounce
300 ms, hạn chờ1,5 giây khi cuộn liên tục; flush khi ẩn/đóng. Thời gian lấy tại
lúc di chuyển, không lúc flush; tab cũ không ghi đè hoạt động mới. Clear epoch
ngăn request trễ hồi sinh vị trí đã quên. Tab khác đã xóa thì tab cũ ngừng tự
lưu và yêu cầu mở lại. Không export/sync vị trí trong settings/ZIP từ vựng.

**Đã sửa:** trình đọc riêng, tự lưu/khôi phục, chọn file fallback, tích hợp khung
dịch, worker/assets local và migration cộng thêm. Bản PDF native trước đây giữ
nguyên identity theo URL; khi chuyển trực tiếp sang reader, giữ hash lịch sử
cũ. Khi mở bằng file picker lần đầu, lịch sử dùng content hash.

**Đã kiểm thử:** production Edge, PDF80 trang, restore sau reload/đổi tên/đóng
tab, file khác độc lập, page/scroll/zoom, không ghi đè khi resize/restore, giới
hạn ba canvas và hủy khi chuyển nhanh, quên rồi tự lưu lại, chọn text thật từ
PDF.js qua khung dịch dùng API mô phỏng, viewport390/760/1280. Harness PDF có
**39** assertion gồm20 của native sidebar. Migration v1 thật giữ nguyên mọi
record/budget/epoch; timestamp cũ và request sau clear bị từ chối. Vocabulary
68 assertion và scale1.000 từ/2.000 MP3/9.000 answers25 assertion vẫn đạt.

**Chưa kiểm thử:** OpenAI live, toàn bộ PDF mã hóa/CJK/JPX/ICC ngoài fixture,
file200 MiB/20.000 trang hoặc thao tác native context menu bằng chuột OS.
**Bị chặn:** không có blocker triển khai. HTML ôn từ không cần cập nhật.

Lệnh regression: `SKIP_FREE_API=true`, test source, fmt/lint/type-check,
`pnpm zip:edge`, `node scripts/debug/check-pdf-reading.mjs`,
`check-vocabulary.mjs`, `check-vocabulary-scale.mjs`. License xem
[PDF_THIRD_PARTY_NOTICES.md](PDF_THIRD_PARTY_NOTICES.md).

Source **4.078 test đạt /1 bỏ qua**, live free-api loại theo AGENTS.md.

ZIP `ReadFrog-Edge-1.58.0A-AutoPDF.zip`: **410 file /8.690.985 byte**, tăng
**2.423.759 byte** so với bản PDFReading trước. Đã kiểm CRC và đối chiếu từng
file với build chạy Edge; không đóng gói profile, fixture, test key, `.env`,
sourcemap hoặc Node canvas binaries. Worker và bộ assets/license PDF.js local
có trong gói. SHA-256:
`A9633462659A642AD341557AFEDFDD65937C54CE0F3F6143CA963DDDDAAAC223`.
HTML ôn từ giữ nguyên SHA-256
`301315CED603BDCB46649DBC63E57B529AEA866414123FD1392BFEF55405DDFF`.

## Bản 1.58.0-a.10 / manifest 1.58.0.11

Nhánh `codex/pdf-reading-panel`, tiếp tục từ `9e2a8724`, tên hiển thị **1.58.0A**.
Giữ config schema **124**, vocabulary DB **4**, ZIP từ vựng **5**, report học
**3** và mọi migration đã phát hành.

## Cách dùng

1. Ghi đè ZIP mới vào thư mục extension unpacked hiện có rồi **Reload** tại
   `edge://extensions`. Giữ ID/thư mục cũ để giữ key, cấu hình và sổ từ.
2. Bôi đen đoạn copy được trong PDF local → chuột phải → **Read Frog → Translate**.
   PDF được nhận diện sẽ mở sidebar. Có thể dùng mục **Dịch trong khung cố định
   (PDF)** hoặc bấm **PDF** trong popup extension để mở khung trước.
3. Chọn đoạn khác và dịch sẽ cập nhật cùng khung. Chỉ bôi đen không tự gửi văn
   bản. Bấm trở lại PDF không làm mất khung. Khi sidebar không hỗ trợ/mất user
   gesture, dùng cửa sổ kết quả trước đây; vẫn có làm sạch/lịch sử nếu biết tài liệu.
4. **Văn bản PDF và cách làm sạch** cho xem đoạn gốc/văn bản dùng để dịch,
   tắt nối dòng hoặc bật bỏ `-` khi từ bị ngắt. Đổi tùy chọn sẽ dịch lại đoạn.
5. **Lịch sử tài liệu** cho xem bản lưu không gọi API, xuất JSON hoặc xóa riêng
   tài liệu này. Chọn lại đoạn/cấu hình trùng dùng cache; **Regenerate** chủ động
   gọi dịch mới. Bản lưu ngôn ngữ khác được ghi rõ.

Giữ copy, TTS Microsoft/OpenAI, dừng, đổi ngôn ngữ, glossary chung và lưu từ vào
sổ. Khung hiển thị tài liệu được gửi gần nhất trong cửa sổ Edge đó, kèm tiêu đề
file. Không suy đoán số trang hoặc inject vào text layer của Edge native.

## Làm sạch và lưu trữ

- `pdf-text.ts` chuẩn hóa NFC/CRLF, nối dòng prose/soft hyphen, giữ đoạn trống,
  danh sách/bullet, tab/hàng có khoảng cách cột, công thức nhận diện được và code
  fence. Không có tọa độ nên không sắp lại thứ tự đọc nhiều cột hoặc hứa khôi
  phục mọi bảng/công thức. Có thể tắt để giữ nguyên văn bản.
- Hard hyphen được giữ mặc định: `well-\nknown` → `well-known`. Bỏ `-` là opt-in
  vì `infra-\nstructure` có thể cần ghép nhưng `well-known` cần dấu nối. Giới hạn
  cả raw/prepared 20.000 ký tự; không âm thầm cắt đoạn quá dài.
- Chỉ đoạn được chọn đi qua runtime OpenAI chính thức hiện có. Không đọc/tải
  lại/upload toàn PDF, không gửi tên/đường dẫn file vào prompt.
- Mã tài liệu là SHA-256 của URL browser cung cấp, bỏ fragment như `#page=…`.
  Chỉ tên và mã file được dùng trong lịch sử. Cùng đường dẫn là cùng tài liệu,
  không phải checksum nội dung file; cache vẫn xét toàn bộ đoạn/prompt. Chuyển
  file sang đường dẫn khác tạo lịch sử khác. Nếu không biết URL hợp lệ, vẫn
  dịch và ghi rõ chưa nhận diện file, không gộp các nguồn không rõ vào một sổ giả.
- Vùng chọn hiện hành trong `storage.session` có TTL 30 phút, channel theo
  browser window. Đóng tab nguồn/cửa sổ xóa text tạm; lịch sử đã lưu vẫn còn.
  Không nhầm host sidebar window ID với ID popup khi cleanup.
- IndexedDB riêng `read-frog-pdf-reading` **v1**: `documents`, `translations`,
  `meta`. Bản dịch lưu raw, prepared, output, ngôn ngữ, model, cờ làm sạch và
  thời gian. Không lưu reasoning, provider config, key hay đường dẫn file.
- Cache dùng document ID, instructions/prompt hiệu dụng (kể cả glossary khớp),
  OpenAI output identity, credential revision và cờ làm sạch. Đổi nội dung,
  model/reasoning/temperature/ngôn ngữ/prompt/glossary liên quan/key không dùng
  nhầm bản cũ. Không cache lỗi/partial/đoạn đã hủy.
- Tối đa **1.000 bản dịch / 32 MiB tổng**. Cùng khóa cập nhật thay vì nhân đôi.
  Ledger byte/count trong transaction tránh quét toàn bộ sau mỗi đoạn. Đầy
  vẫn hiện kết quả và báo chưa lưu, không tự xóa bản cũ. Xóa theo tài liệu tăng
  epoch, ngăn stream đang chạy phục hồi dữ liệu vừa xóa; giữ các tài liệu khác.
- **Xuất lịch sử JSON** dùng format `read-frog-pdf-history`, version **1**,
  chứa đoạn gốc/bản dịch do người dùng chủ động tải. Chưa có import JSON lịch
  sử. Không gộp vào settings backup hoặc ZIP từ vựng, không cloud sync.

## Bổ sung PDF song ngữ theo đoạn

Build `1.58.0.23` / `1.58.0A` thêm hai khung theo đoạn trong reader PDF.js;
không thay chức năng chọn chữ native, lịch sử hoặc schema DB2. Hướng dẫn,
giới hạn nhận diện và hợp đồng bảo toàn khi merge ở
[PDF_BILINGUAL_READING.md](PDF_BILINGUAL_READING.md). Các số liệu và phạm vi
kiểm thử của bản sidebar bên dưới là snapshot lịch sử, không thay báo cáo
regression của bản mới.

## Bảo trì và kiểm thử

Giữ `openNativePdfPanel()` gọi `sidePanel.open()` đồng bộ trong lượt tương tác
menu, trước mọi await. Với guest tab `-1`/thiếu metadata, dùng window focus đã
biết; chỉ tra tab thật cho lifecycle, không gửi frame message sang tab khác.
Không gọi `windows.remove()` bằng host sidebar window ID. Giữ sender guard
`getNativePanelSelection`: đúng extension, trang `sidepanel.html`, frame trên
cùng. Popup cũ tiếp tục dùng channel opaque riêng.

`scripts/debug/check-pdf-reading.mjs` chạy production Edge bằng profile riêng,
PDF local thật, nút PDF/sidebar thật, OpenAI mô phỏng. Vùng chọn seed tại native
bridge; CDP không bấm OS context menu. Route menu/guest/focus/gesture/fallback/
sender/TTL có unit test. Assertion kiểm tra cache/offline/reload, raw/clean,
regenerate, export, tách/xóa tài liệu, hủy request cũ và chờ phản hồi trễ, overflow
320/390/600 px. Ảnh riêng sidebar không được gọi là ảnh toàn cửa sổ Edge.

**Đã sửa:** ba phần ưu tiên (sidebar cố định, làm sạch và lịch sử/cache), nút
PDF trong popup, xuất/xóa lịch sử từng file; đổi bản lịch sử dừng TTS của kết
quả trước. Dùng lại các đường dịch/TTS/lưu từ riêng hiện có.

**Đã kiểm thử 07/11/2026:** 4.068 test đạt, 1 test bỏ qua; `SKIP_FREE_API=true`
và loại live free-api. Format/lint/type-check đạt. Production Edge có **20**
assertion PDF, **68** assertion vocabulary cũ và **25** assertion sổ 1.000 từ /
2.000 MP3 / 9.000 lượt trả lời. Ảnh sidebar 390 px đã được xem; viewport
320/390/600 không overflow. Cache qua reload/offline, glossary/model/target/
prompt/key invalidation, quota/epoch/abort, nguồn guest và fallback có kiểm tra.

ZIP được đối chiếu CRC/từng file với build đã chạy browser, không có test key
hoặc profile trong gói. `ReadFrog-Edge-1.58.0A-PDFReading.zip`: **203 file**,
**6.267.226 byte**, manifest `1.58.0.11` / `1.58.0A`.
SHA-256: `17F1B89F22E897ADC243042AAE301B062430EB5C2F32F50418E84A32A1924425`.
HTML ôn từ giữ nguyên SHA-256
`301315CED603BDCB46649DBC63E57B529AEA866414123FD1392BFEF55405DDFF`;
không cần thay HTML để dùng ba tính năng PDF của extension.

Chưa kiểm thử OpenAI live hoặc tự động bấm OS context menu. OCR cho PDF scan,
trình đọc PDF.js riêng, đọc theo câu và bookmark là các giai đoạn sau, ngoài ba
phần ưu tiên của bản này. Không có phần bị chặn.
