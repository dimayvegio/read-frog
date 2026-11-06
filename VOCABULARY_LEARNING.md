# Sổ từ vựng và HTML ôn tập

## Bản nhiều sổ: 1.58.0-a.5 / manifest 1.58.0.6

Tiếp tục từ `d9504205` trên nhánh `codex/vocabulary-review`. Cấu hình extension
vẫn schema 124; database từ vựng nâng từ version 1 lên **2**, định dạng ZIP mới
là **v2** và tiếp tục đọc được ZIP v1 đã phát hành.

- **Nhập một lần:** lần sau mở lại đúng HTML trên cùng trình duyệt/thiết bị
  sẽ đọc từ, audio, các sổ và tiến độ đã lưu. Không cần nhập lại mỗi buổi học.
- **Nhập cập nhật:** cần nhập ZIP mới khi muốn đưa thêm từ từ extension sang
  HTML/thiết bị khác. Không tự đồng bộ các file ZIP hoặc các thiết bị qua mạng.
- **Nhiều sổ:** bấm **+ Sổ**, đặt Sổ 1/Sổ 2/Sổ 3 hoặc tên riêng; **Đổi tên**
  giữ nguyên ID sổ, từ và lịch ôn. Tạo sổ mới giữ toàn bộ các sổ hiện có.
- **Chọn sổ khi lưu:** dropdown **Lưu vào sổ** trong kết quả dịch web/PDF.
  Từ được lưu vào sổ đã chọn, kể cả khi tác vụ tạo audio kéo dài.
- **Chuyển từ:** trong danh sách Sổ từ, bấm **Chuyển** để mang từ, audio và
  tiến độ sang sổ khác. Cùng từ trong hai sổ có lịch ôn và nội dung độc lập.
- **Mỗi sổ một ZIP:** chọn sổ rồi Xuất ZIP. Tên file lấy tên sổ, bên trong chỉ
  có từ, audio và tiến độ của sổ đó. Giới hạn 2.000 từ/64 MiB áp dụng mỗi sổ.

ZIP v2 giữ cấu trúc bốn phần của v1, thêm `manifest.notebook` gồm `id` (UUID),
`name`, `createdAt`, `updatedAt`; `manifest.version = 2`, `title` là tên sổ.
Văn bản thẻ và progress trong file giữ cấu trúc v1; scope sổ được xác định bằng
manifest. Nhập lại cùng ID sẽ cập nhật sổ đó, ghép lịch mới hơn theo từng kiểu,
không tạo thêm sổ hoặc trộn lịch các sổ. Hai sổ khác ID nhưng cùng tên được
đặt hậu tố `(2)` để phân biệt. Tên đổi mới hơn được giữ theo `updatedAt`.

ZIP v1 chưa có ID sổ: nhập vào sổ đang chọn, hoặc tự tạo Sổ 1 nếu thư viện còn
trống. Sau lần nhập đó có thể xuất ZIP v2 để mang theo tên và ID sổ.

Migration đóng băng tại `src/utils/vocabulary/migrations/v1-to-v2.ts`. Giữ
nguyên các store/definition v1; sao chép từ/lịch sang `notebookCards` và
`notebookProgress` với khóa ghép `[notebookId + id/cardId]`. Audio giữ nguyên,
dùng chung theo hash nhưng ZIP luôn tự chứa đủ audio cần thiết. Thư viện v1 có
dữ liệu trở thành **Sổ 1**, giữ cả ba lịch ôn; DB v1 trống không sinh sổ giả.
ID của Sổ 1 lấy từ fingerprint và thời điểm tạo của thẻ cũ nhất: các bản sao
cùng thư viện v1 nhận cùng ID khi nâng cấp, kể cả khi một bản đã thêm từ mới.
Các sổ tạo mới dùng UUID ngẫu nhiên; đổi tên không đổi ID.
Các thao tác import, chuyển, xóa và kiểm tra dung lượng chạy trong transaction.
Không sửa migration này sau phát hành; bước sau phải là version mới.

**Khi cập nhật HTML:** thay nội dung file cũ và giữ nguyên tên/vị trí file.
Đổi đường dẫn, đổi trình duyệt, xóa dữ liệu hoặc dùng chế độ riêng tư có thể
dùng vùng lưu trữ khác; giữ ZIP để khôi phục. HTML cũ chỉ đọc ZIP v1, nên cần
HTML mới này để nhập ZIP v2. Không đưa key vào HTML hoặc ZIP từ vựng.

Đã kiểm tra nâng cấp bằng chính HTML a.4 đã phát hành: nhập ZIP v1, ôn từ,
thay file bằng HTML mới tại **cùng URL**, mở lại trong cùng context Edge và
đối chiếu từ/lịch. Phần dưới lưu lại đặc tả và artifact của bản đầu tiên.

### Kết quả bản nhiều sổ — 06/11/2026

- **Đã sửa:** tạo/đổi tên nhiều sổ, chọn sổ khi lưu trên web/PDF, chuyển từ
  mang theo audio/lịch ôn, xuất từng sổ, nhập lại cập nhật theo ID, migration
  thư viện cũ sang Sổ 1. Dữ liệu/lịch của cùng từ ở hai sổ độc lập.
- **Đã kiểm thử:** 3.984 test đạt, 1 test bỏ qua; `SKIP_FREE_API=true`, loại
  free-api live. Format và lint/type-check đạt. Production Edge có 42 assertion:
  toàn bộ 25 kiểm tra trước cùng luồng nhiều sổ, chọn sổ ngay trên popup,
  đổi sổ sau khi lưu, chuyển từ/audio/lịch, ZIP v2 và ZIP v1, nhập lại không
  nhân sổ, nâng cấp từ HTML a.4 thật tại cùng URL, đóng hẳn rồi mở lại Edge
  bằng profile kiểm thử vẫn giữ sổ đang chọn và ba lịch ôn mà không nhập lại.
  UI 360/390/768/1280 px; audio offline và không lỗi JavaScript.
- **Chưa kiểm thử:** OpenAI live/chất lượng từ và giọng thật, điện thoại vật
  lý/iOS và mọi trình mở HTML cục bộ. API/audio dùng mock; PDF dùng trang kết
  quả với selection fixture, không click context-menu PDF của hệ điều hành.
- **Bị chặn:** không có.

Artifact đối chiếu từng file với production build đã kiểm thử và HTML tải
từ extension, không chứa profile, key hoặc sentinel kiểm thử:

- `ReadFrog-Edge-1.58.0A-Notebooks.zip`: 204 file, 6.112.573 byte,
  manifest `1.58.0.6` / `1.58.0A`.
  SHA-256: `818E547F3FC5615C78E892E2FAFF459FF1C6933D76B10A7E325C8EE52AD40CDE`.
- `ReadFrog-OnTuVung.html`: 427.393 byte. Cập nhật đè **đúng tên/vị trí HTML
  cũ**, không đổi URL lưu trữ.
  SHA-256: `C084FA5FED5AFD4C31E5735DA73EEF9D39B44C8CA5194732FC8283C9DE2A6D0F`.

## Bản đầu tiên: phương án và hợp đồng v1

Từ baseline `cb6a3cc9`, nhánh `codex/vocabulary-review`. Package `1.58.0-a.4`,
manifest `1.58.0.5`, tên hiển thị `1.58.0A`; cấu hình vẫn schema **124**.
Thư viện có database riêng `read-frog-vocabulary`, version 1. Không thay kho key,
database glossary/cache, dịch trang, phụ đề hoặc playback TTS hiện có.

Ba phần dùng chung dữ liệu: nút **Lưu để học** trên kết quả dịch web/PDF;
trang **Sổ từ** trong extension; và một HTML độc lập để học trên máy tính/phone.
HTML chứa cả mã/CSS, giao diện responsive, nút chạm từ 44 px, sáng/tối và giảm
chuyển động theo hệ thống. Thư viện được lưu trên trình duyệt; ZIP dùng để mang
cả nội dung, âm thanh và tiến độ sang thiết bị khác.

## Sử dụng

1. Giải nén ZIP extension đè đúng thư mục cũ, Reload rồi refresh web/PDF.
   Giữ cùng extension ID để giữ credential.
2. Bôi đen một từ/cụm từ ngắn, dịch rồi bấm **Lưu để học**. Vùng chọn tạo thẻ
   tối đa 160 ký tự; ngữ cảnh tối đa 1.800 ký tự. PDF cần text copy được, chưa có OCR.
3. OpenAI tạo nghĩa theo ngữ cảnh, IPA, loại từ, hướng dẫn đọc, dịch câu gốc,
   một ví dụ có dịch, ba nghĩa gây nhiễu và các cách viết được chấp nhận.
   Sau đó tạo hai audio: đọc từ và đọc ví dụ. Chỉ lưu khi hoàn tất cả hai.
4. Mở **Sổ từ** từ popup hoặc kết quả dịch. Có thể dùng **Thêm từ bằng OpenAI**
   và dán câu gốc trực tiếp trên trang này.
5. **Xuất ZIP**, chuyển ZIP và `ReadFrog-OnTuVung.html` sang thiết bị học.
   Trong HTML bấm **Nhập ZIP**, không giải nén bộ từ.
6. Sau buổi ôn, **Xuất ZIP** để mang theo tiến độ. HTML không âm thầm ghi đè
   file ZIP đã nhập; giữ bản vừa tải xuống thay bản cũ khi cần.

Tạo audio dùng cấu hình OpenAI TTS, ngay cả khi nút đọc thường đang chọn
Microsoft. Tạo nội dung/audio mới dùng API; khi học, HTML phát audio đã lưu,
không cần mạng hoặc API key. Giọng đọc là giọng AI. Key không nằm trong bộ từ,
HTML hay ZIP. Capture trùng hoàn toàn được nhận diện trước API; cùng từ/cùng
nghĩa được nhận diện sau bước text và bỏ qua tạo audio mới.

Đổi trình duyệt/đường dẫn HTML, xóa dữ liệu hoặc đổi thiết bị có thể dùng vùng
lưu trữ khác: giữ ZIP để khôi phục. Trên điện thoại, mở bằng trình duyệt chạy
JavaScript; trình xem trước tệp của hệ điều hành có thể không chạy ứng dụng.
Nếu hệ điều hành chặn HTML cục bộ, phục vụ cùng HTML qua HTTP(S). Không tự publish.

PDF native chỉ chuyển phần văn bản được chọn; extension không đọc được câu
xung quanh một từ đơn. Để cung cấp đủ ngữ cảnh ở PDF, dùng **Thêm từ bằng OpenAI**
trong Sổ từ và dán câu gốc. Trên web, nút lưu lấy ngữ cảnh của vùng chọn hiện có.

## Ba kiểu học

- **Thẻ lật:** từ, IPA, câu gốc; hiện nghĩa/ví dụ rồi chọn Chưa nhớ/Khó/Nhớ/Dễ.
  Space hiện nghĩa; phím 1–4 chấm mức độ.
- **Trắc nghiệm:** bốn nghĩa được tạo và lưu cùng thẻ. Học được ngay với một từ.
- **Gõ đáp án:** xem nghĩa và gõ từ. Chấp nhận các cách viết đã lưu; chuẩn hóa
  hoa/thường, khoảng trắng và nháy cong; giữ phân biệt dấu có ý nghĩa.

Sai ở trắc nghiệm/gõ chỉ cho chấm Chưa nhớ. Ba kiểu có lịch riêng. Lịch v1
là thuật toán đơn giản của bản local, không tuyên bố dùng FSRS/Anki: Chưa nhớ
sau một phút, từ mới Nhớ sau một ngày, Dễ sau bốn ngày; lần sau tăng khoảng
theo `scheduleReview`. Luyện thêm tất cả vẫn cập nhật lịch khi chấm điểm.

## ZIP v1

```text
Tu-vung-YYYY-MM-DD.zip
├── manifest.json
├── vocabulary.json
├── progress.json
└── audio/<sha256>.wav
```

`manifest.json`: `format: "read-frog-vocabulary"`, `version: 1`, `title`,
`exportedAt` (epoch milliseconds), `cardCount`. Version định dạng độc lập với
version extension và schema cấu hình.

| Nhóm trong mỗi thẻ | Field                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| Danh tính          | `id`, `captureKey`, `createdAt`, `updatedAt`                                           |
| Từ/nghĩa           | `word`, `language`, `ipa`, `partOfSpeech`, `meaning`, `definition`, `pronunciationTip` |
| Ngữ cảnh           | `context`, `originalTranslation`, `sourceTitle`, `sourceUrl`                           |
| Ví dụ              | `example.sentence`, `example.translation`                                              |
| Bài tập            | `distractors` (3 nghĩa), `acceptedAnswers`, `tags`                                     |
| Audio              | `audio.word`, `audio.example` (SHA-256 của file WAV)                                   |
| Giọng đã tạo       | `speech.model`, `speech.voice`, `speech.speed`                                         |

ID thẻ là SHA-256 của ngôn ngữ + từ chuẩn hóa + nghĩa chuẩn hóa. Cùng từ khác
nghĩa tạo thẻ riêng; cùng nghĩa giữ thẻ đầu, chưa gộp nhiều câu nguồn vào một thẻ.

`progress.json`: array theo `cardId`, mỗi mục có `flash`, `choice`, `type`.
Mỗi kiểu giữ `dueAt`, `intervalDays`, `reviews`, `lapses`, `updatedAt`.
Import ghép theo ID, giữ lịch mới hơn **của từng kiểu**, không reset lịch mới
bằng ZIP cũ. Import là bổ sung, không tự xóa các từ ngoài file. Xóa từ trên
thiết bị không sửa các bản ZIP cũ.

V1 nhận ZIP32 không mã hóa, STORE/DEFLATE, đúng các tên file trên; tối đa 64 MiB
nén/giải nén, 2.000 thẻ, 3 MiB/audio, 4 MiB/file JSON. Kiểm tra central directory
trước giải nén, CRC32, schema chặt, audio reference và SHA-256 trước transaction.
File sai không thay thư viện cũ. Audio là WAV đúng transport hiện có, không
đổi giả đuôi MP3. Khi thư viện đầy: xuất ZIP, **Tạo bộ mới**, rồi nhập/tạo bộ khác.

## Bảo trì

- `src/utils/vocabulary/`: schema v1, archive, transaction và lịch ôn.
- `src/entrypoints/background/vocabulary.ts`: generation port có hủy,
  Structured Outputs và hai lượt TTS; làm sạch lỗi trước khi trả UI.
- `openai-tts.ts`: `generateOpenAIAudio` có cancellation riêng, không claim
  hoặc hủy playback Microsoft/OpenAI hiện tại.
- `src/vocabulary-review/`: UI dùng chung cho trang extension và HTML riêng.
- `scripts/build-vocabulary-review.mjs`: gói IIFE/CSS/giấy phép vào một HTML,
  chặn network bằng CSP. Artifact `public/vocabulary-review.html` không commit.
- `scripts/debug/check-vocabulary.mjs`: Edge production build, profile riêng,
  Responses/TTS mock; không đọc profile hoặc key thật.

`pnpm build:review` tạo HTML; các script build/zip tự chạy bước này. Rebuild sau
khi sửa UI để cập nhật cả HTML và extension. HTML độc lập không kéo credential,
AI SDK hoặc `#imports` vào. Backup cấu hình extension vẫn tách khỏi thư viện;
backup từ vựng dùng ZIP riêng. Giữ v1 đọc được; thay nghĩa field/ID/format phải
có version/migration rõ ràng, không viết lại hợp đồng đã phát hành.

## Kiểm chứng và giới hạn

Unit tests bao phủ ZIP/dấu Việt/audio, giới hạn và file lạ, merge lịch,
transaction, generation lỗi/hủy và cancellation TTS độc lập. Browser tests
dùng API mock và âm thanh fixture; không coi là chất lượng OpenAI thật.
Test viewport điện thoại trong Edge, chưa chạy điện thoại vật lý/iOS.
Chưa có cloud sync, chấm phát âm, sửa ví dụ rồi tái tạo audio, tự ghi đè ZIP
hoặc nút lưu từ trực tiếp trong menu phụ đề.

### Kết quả kiểm chứng 06/11/2026

- **Đã sửa:** lưu từ qua web/PDF, nội dung/audio OpenAI, thư viện local, ZIP v1,
  HTML độc lập với giao diện phone/desktop, ba kiểu học và lịch ôn riêng.
- **Đã kiểm thử:** 3.975 test đạt, 1 test bỏ qua; đặt `SKIP_FREE_API=true` và
  loại free-api live có chủ đích. Lint/type-check đạt. Edge production có 25
  assertion: popup web thật trong shadow DOM, trang kết quả native PDF có
  selection fixture, generation qua transport thật với API mock, tải HTML từ
  extension, nhập/xuất ZIP, phát WAV blob offline, ba kiểu ôn, merge lịch mới,
  từ chối ZIP lạ, tìm tiếng Việt, UI 360/390/768/1280 px và không lỗi JavaScript.
- **Hồi quy đạt:** OpenAI/Microsoft TTS, cache/Stop/offscreen/PDF read-aloud và
  menu/style YouTube, dịch trước hai phút, dịch/khôi phục trang.
- **Chưa kiểm thử:** OpenAI API live/chất lượng từ và giọng thật; điện thoại
  vật lý/iOS và mọi trình mở HTML cục bộ. Browser fixture không phải click
  context-menu native PDF của hệ điều hành; luồng đó đã có kiểm tra riêng trước.
- **Bị chặn:** không có. Artifact và hash cuối ghi trong báo cáo phát hành.

### Artifact đã đóng gói

- ZIP extension: `ReadFrog-Edge-1.58.0A-Vocabulary.zip`, 204 file,
  6.105.837 byte; manifest `1.58.0.5` / `1.58.0A`.
  SHA-256: `D86786EF37531C28F593093DDB54A56FD4CFD2C91479B5BEB75DDB192E612A70`.
- HTML độc lập: `ReadFrog-OnTuVung.html`, 415.624 byte.
  SHA-256: `2D1EA45A2D588649DB5969674B03BA414D8591D96A9378AF7423167A2F869983`.

Đã đối chiếu từng file trong ZIP với production build đã kiểm tra bằng Edge,
và HTML trong ZIP với bản tải bằng nút Tải HTML thực tế của trang extension.
Không có profile, file môi trường, test fixture/sentinel hoặc credential trong gói.
