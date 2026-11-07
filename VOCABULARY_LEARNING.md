# Sổ từ vựng và HTML ôn tập

## Nhiều ngữ cảnh và từ đang học: 1.58.0-a.15 / manifest 1.58.0.16

Vocabulary DB **5** chỉ thêm store `sources`; không đổi các migration đã phát
hành v1–v4. ZIP **v6** thêm `sources.json`/`sourceCount`, đọc v1–v5; report JSON
**v3** và quy tắc đánh giá giữ nguyên. Khi cập nhật cần thay cả HTML ôn tập.

**Lưu để học → Thêm câu vào từ đã có** cho chọn nghĩa đang lưu, thêm đoạn nguồn,
trang PDF hoặc mốc video mà không gọi OpenAI/tạo lại audio. Tối đa 20 câu/từ;
câu trùng giữ bản đầu, không thay lịch ôn hoặc giả lập lượt trả lời. **Xem → Những
câu đã gặp** mở/xóa nguồn; thẻ lật và điền câu luân phiên nguồn có sẵn. ZIP giữ
nguồn khi chuyển sổ/thiết bị; HTML vẫn học offline. Không lưu byte/đường dẫn PDF.

Từ trong sổ đang chọn được tô trên web/PDF Read Frog/phụ đề; trạng thái dựa trên
toàn bộ logs của inventory hiện tại. Bấm mở nghĩa local, không gọi AI tự động.
Chi tiết giới hạn, luyện câu YouTube, bảng usage và kiểm chứng:
[STUDY_FLOW_AND_USAGE.md](STUDY_FLOW_AND_USAGE.md).

## Luyện nhớ và sổ 1.000 từ: 1.58.0-a.9 / manifest 1.58.0.10

Tiếp tục từ `c46ea0ba`, nhánh `codex/vocabulary-review`; vẫn hiển thị
**1.58.0A**. Config schema **124** giữ nguyên; vocabulary DB **4**, ZIP mới
**v5**, report JSON **v3**. Các mục bên dưới là lịch sử những bản đã phát hành.

### Học và xuất tiến trình

- **Học hôm nay** chọn tối đa 10 từ, gồm tối đa 5 từ mới, ưu tiên từ yếu và
  đến lịch. Từ mới có bước xem mẫu rồi ẩn đáp án. Ba vòng xen kẽ gõ theo nghĩa,
  nghe và gõ, điền từ trong câu; nếu thiếu câu chứa đúng từ thì dùng gõ theo
  nghĩa, không tự tạo hoặc đoán dạng biến đổi của từ.
- **Luyện từ hay sai** dùng cùng các vòng cho nhóm cần ôn. **Luyện riêng /
  Tiếp tục** cho chọn gõ nhiều vòng, nghe và gõ hoặc điền câu. Tối đa 10 từ/lượt;
  không đưa cả 1.000 từ vào một buổi.
- Sai hoặc mở đáp án phải gõ sửa theo mẫu. Chữ khác được đánh dấu. Sau đó từ
  quay lại khi mẫu đã ẩn, sau tối đa ba bước xen kẽ nếu hàng đợi còn đủ từ;
  mỗi từ có tối đa hai lượt kiểm tra bổ sung để tránh vòng lặp vô hạn.
- Gợi ý chữ đầu/một phần, dán đáp án, mở đáp án và gõ sửa đều có metadata
  riêng. Chúng không làm tăng số lần tự nhớ đúng hoặc chuỗi nhớ liên tiếp.
  Dictation giấu từ/IPA, phát audio đã lưu và chỉnh tốc độ; không gọi OpenAI.
- Buổi đang dở lưu local, đóng/mở lại HTML rồi chọn **Luyện riêng / Tiếp tục**
  để tiếp tục đúng bước. Đổi kiểu luyện rõ ràng có thể bắt đầu lượt mới.
  Lịch ôn `type` cập nhật thận trọng tối đa một lần/từ/buổi, lấy kết quả yếu
  nhất trong buổi; luyện lặp không nhân khoảng cách ôn. Thẻ lật/trắc nghiệm cũ
  vẫn có lịch riêng. Gõ sửa không thay lịch hoặc ghi đè lượt sai đầu tiên.

Trong **Nhật ký**, bấm **Tải báo cáo ngắn cho ChatGPT**, upload file `.md`.
Mỗi từ được phân nhóm theo toàn bộ lịch sử hiện có, có số tự đúng/sai/hỗ trợ,
kiểu bài còn yếu, lỗi và cách ôn tiếp. Với hơn 50 từ đã kiểm tra, báo cáo đưa
chi tiết tối đa 15 từ đầu mỗi nhóm cần ôn/củng cố, rồi bảng gọn của **mọi từ đã
kiểm tra** (ngôn ngữ, nhóm, đúng/sai/hỗ trợ, ngày cuối, cách ôn tiếp). Từ chưa
có đủ dữ liệu nằm riêng. Không nhét hàng nghìn event thô vào Markdown.
**Tải báo cáo JSON** và **Xuất ZIP** vẫn giữ toàn bộ lượt trả lời.

Trong kết quả **Dictionary** mặc định cũng có **Lưu để học** và chọn sổ như
dịch bôi đen. Tạo nội dung/audio tiếp tục dùng luồng OpenAI riêng hiện có,
không đưa key vào từ vựng, HTML, báo cáo hoặc ZIP.

### Dữ liệu và tương thích

- DB v4 chỉ thêm store `learningRuns: &notebookId`. Giữ nguyên definition và
  snapshot migration v1/v2/v3. Queue, đáp án đang hiện và cờ hỗ trợ lưu cùng
  mỗi bước; ghi đáp án/lịch/event/run trong một transaction. Guard run/task ID
  tránh cửa sổ cũ ghi sang bước mới; quota lỗi thì rollback toàn bộ.
- Event v5 thêm `exercise`: kind, runId, parentAttemptId cho gõ sửa, assisted,
  pasted, hintLevel, audioReplays, expectedAnswer. Không thêm đoạn nguồn hoặc
  URL vào log. Gõ sửa liên kết event gốc bằng ID, không thay đáp án đầu tiên.
- ZIP v5 giữ cấu trúc và nén MP3/WAV/DEFLATE 9 của v4. Reader **v1–v5**;
  schema event v4 được đóng băng riêng, không âm thầm đổi nghĩa file cũ.
  ID từ/sổ/event, audio, lịch và log được giữ khi export/import; không cộng
  trùng ID. Queue đang dở là cache local, không nằm trong ZIP; kết quả đã ghi
  và lịch ôn vẫn đi theo ZIP. Xóa sổ/nhật ký xóa cache buổi tương ứng.
- Report v3 thêm thống kê theo bài và hỗ trợ/gõ sửa. Assessment dùng
  `review-evidence-rules-v2`, vẫn cần nhiều lượt tự nhớ đúng qua ít nhất hai
  phiên và 24 giờ; một lần đúng, gõ sửa hoặc tự chấm không xác nhận đã thuộc.
- Giữ giới hạn 2.000 từ, tổng 64 MiB/sổ sau giải nén, 20.000 event/16 MiB log.
  Số từ không thay thế giới hạn dung lượng: audio dài có thể cần chia sổ.
  Khi log đầy, xuất JSON/ZIP rồi xóa nhật ký có xác nhận; không tự bỏ log cũ.

### Kiểm chứng 07/11/2026

Đã kiểm thử bằng production HTML trên Edge, profile riêng, dữ liệu mô phỏng:
**1.000 từ, 2.000 MP3 có hash riêng, 50.688.000 byte audio, 9.000 lượt trả lời**.
Kiểm tra nhập/mở/tìm từ cuối, phân trang 40 dòng, học ba vòng, khôi phục bước
gõ sửa/gợi ý sau reload, paste, phát MP3 offline, xuất MD/JSON/ZIP, nhập ZIP
lại không đếm trùng, heap sau GC qua 12 lần đổi tab và viewport 360/390/768/1280.
Script tái lập: `scripts/debug/check-vocabulary-scale.mjs`; lưu evidence dưới
`.codex/vocabulary-scale-*`. Chạy sau `pnpm build:edge`, có Puppeteer harness
theo `scripts/debug/check-vocabulary.mjs`. Đây không phải 1.000 lượt gọi API.

Đã sửa: các chế độ luyện và persistence nêu trên, save từ Dictionary, báo cáo
gọn theo từng từ cho sổ lớn. Đã kiểm thử: **4.034 test đạt, 1 test bỏ qua**;
`SKIP_FREE_API=true`, loại live free-api; format/lint/type-check đạt. Production
Edge: **68 assertion** cho các luồng cũ và Dictionary, **25 assertion** cho
sổ lớn/luyện có hướng dẫn; kiểm tra ảnh điện thoại mô phỏng sau khi DOM tải đủ.
Fixture lớn nhập **9,014 giây**, tìm từ cuối **91 ms**, MD **189 ms**, ZIP
**1,667 giây**; Markdown **75.304 byte** so với JSON thô khoảng 6,8 MB.
Qua 12 lần đổi tab, heap sau GC chỉ tăng **34.516 byte** trong lần đo này.
Đây là số đo trên máy kiểm thử, không phải cam kết tốc độ cho mọi điện thoại.

Artifact đối chiếu CRC/từng file với build đã kiểm thử và HTML thực tải từ
extension; cùng SHA HTML ở bài kiểm tra 1.000 từ:

- `ReadFrog-Edge-1.58.0A-GuidedLearning.zip`: 205 file, **6.265.108 byte**,
  manifest `1.58.0.10` / `1.58.0A`.
  SHA-256: `BF137EB655111529CE5266B378EE8A41CE882D4C1617FD827691E0B0DE5035E2`.
- `ReadFrog-OnTuVung.html`: **652.836 byte**.
  SHA-256: `301315CED603BDCB46649DBC63E57B529AEA866414123FD1392BFEF55405DDFF`.

Thay HTML tại cùng tên/vị trí, đóng tab cũ rồi mở lại để giữ dữ liệu. Extension
ghi đè build vào thư mục unpacked hiện có và Reload; không cần cài thành ID mới.

Chưa kiểm thử OpenAI live, điện thoại vật lý hoặc server public. Không có
phần bị chặn; không publish site hoặc thêm cloud sync.

## Báo cáo cho ChatGPT: 1.58.0-a.8 / manifest 1.58.0.9

Tiếp tục từ `5734cb32`, nhánh `codex/vocabulary-review`. DB **3**, ZIP **v4**,
config schema **124** giữ nguyên. Report JSON lên **v2**; bổ sung file Markdown
dễ đọc, không thay log/SRS/audio/credential hoặc phát sinh API call.

Trong **Nhật ký**, bấm **Tải báo cáo cho ChatGPT**, gửi file `.md` vừa tải.
Đầu file có danh sách từ cần tập trung, nghĩa/ngôn ngữ, số đúng/sai/mở đáp án,
lý do cụ thể và tối đa ba lỗi gần nhất cùng đáp án. File chứa đủ từ trong mỗi
nhóm, UI hiện tối đa 10 từ cần ôn. JSON vẫn có toàn bộ event và thêm
`assessment` trước các bảng thống kê để công cụ phân tích tìm thấy ngay.

Phân nhóm tính từ **toàn bộ nhật ký**, chỉ cho từ còn trong sổ nếu có inventory;
không bỏ bằng chứng cũ khi người dùng lọc thống kê 7/30 ngày. Các nhóm:

- `needsReview`: lượt gần nhất sai/mở đáp án, tự chấm Chưa nhớ/Khó, hoặc trong
  năm lượt chấm tự động gần nhất còn lỗi và chưa có ba lần đúng liên tiếp.
- `developing`: đã có câu trả lời được chấm nhưng chưa đủ dấu hiệu ổn định.
- `recallSignals`: ít nhất ba câu đúng liên tiếp, ít nhất hai phiên, chuỗi
  kiểm tra trải qua ít nhất 24 giờ và có câu gõ đáp án. Gợi ý có dấu hiệu nhớ,
  không khẳng định đã thuộc vĩnh viễn hoặc đạt trình độ CEFR.
- `notAssessed`: chưa có nhật ký hoặc mới tự chấm thẻ lật không báo khó/chưa
  nhớ; không gộp vào từ chưa thuộc hoặc đã thuộc. Dữ liệu cũ không từng ghi
  vẫn là thiếu bằng chứng, không tạo lịch sử giả.

`assessment.method = review-evidence-rules-v1`, scope `all-recorded-history`,
giữ `inventoryProvided`, bốn nhóm, lý do, số lượt/chấm đúng/sai/mở, chuỗi đúng,
phiên/span ngày và `recentMistakes` với answer/expectedAnswer. Dữ liệu thống kê
theo kỳ vẫn ở summary/byMode/byLanguage/daily/words/events như report v1.
Inventory không được cung cấp thì dùng snapshot các từ có log và đánh dấu rõ;
UI luôn truyền inventory hiện tại, không đề xuất từ đã xóa.

Markdown tách bốn nhóm và ghi rõ khác biệt phạm vi thống kê/phân nhóm, tự chấm
và chấm tự động. Escape HTML, ký tự bảng/Markdown và xuống dòng trong dữ liệu.
Không gửi dữ liệu tự động sang ChatGPT, không cần key để tạo báo cáo. Report
v1 cũ vẫn là file số liệu để phân tích; các file report không dùng làm bộ nhập
từ vựng, tiếp tục dùng ZIP v4 để chuyển dữ liệu đầy đủ.

**Kiểm chứng 06/11/2026:** đã sửa danh sách ưu tiên/lý do, inventory chưa kiểm
tra và bản xuất Markdown/JSON v2. 4.021 test đạt, 1 test bỏ qua; đặt
`SKIP_FREE_API=true` và loại free-api live. Format/lint/type-check đạt, 67
assertion production Edge đạt: tải MD/JSON thực tế, từ `reverse` vẫn cần ôn
sau một lần đúng lại, giữ lỗi/đáp án và lý do, không chứa key/URL nguồn, phone
viewport và các luồng ZIP/log/SRS/HTTP cũ. Unit kiểm tra hồi phục qua nhiều
phiên/ngày, không suy ra thuộc từ trắc nghiệm hoặc tự chấm, thiếu dữ liệu,
phạm vi lọc ngày và escape Markdown. Chưa thử điện thoại vật lý, OpenAI live
hoặc server public; không có phần bị chặn, không publish site/cloud sync.

Artifact đối chiếu từng file với build kiểm thử và HTML tải từ extension:

- `ReadFrog-Edge-1.58.0A-ChatGPTReport.zip`: 205 file, 6.247.628 byte,
  manifest `1.58.0.9` / `1.58.0A`.
  SHA-256: `CF2A32A3EC4F81FA2FD7EB83CF0D497DF27681E5EBDF4A60F13A7D03B3156B09`.
- `ReadFrog-OnTuVung.html`: 625.379 byte.
  SHA-256: `61991918EFA097AD9580A260CE977120DC1DC4AC3FDA3EC7F5330B4268E84537`.

## Nhật ký học: 1.58.0-a.7 / manifest 1.58.0.8

Tiếp tục từ `5d25ccd9`, nhánh `codex/vocabulary-review`; vẫn hiển thị **1.58.0A**.
Config giữ schema **124**, vocabulary DB lên **3**, ZIP mới **v4** và report
JSON **v1**. Giữ toàn bộ nén MP3/DEFLATE 9 và đọc ZIP v1/v2/v3.

### Cách dùng và ý nghĩa số liệu

Chọn sổ rồi mở tab **Nhật ký**. Có số từ duy nhất đã kiểm tra, tổng lượt,
đúng/sai, mở đáp án, tỷ lệ đúng tự động; bảng theo từng kiểu học, số phiên,
trung vị thời gian phản hồi, từ hay sai và 30 lượt gần nhất. Lọc toàn bộ/7/30
ngày. **Tải báo cáo JSON** mang theo toàn bộ lượt trong khoảng đã chọn,
tổng hợp theo ngày/ngôn ngữ/từ để gửi phân tích; không cần gửi cả audio ZIP.

- Một lượt là đáp án đầu tiên được kiểm tra, một lần mở đáp án hoặc một lần
  tự chấm thẻ lật; chỉ hiển thị từ chưa tạo lượt. Trắc nghiệm/gõ ghi ngay lúc
  kiểm tra, kể cả khi bỏ qua trước khi chấm Nhớ/Khó/Chưa nhớ.
- Đúng/sai tự động chỉ áp dụng trắc nghiệm/gõ. Thẻ lật là **tự đánh giá**, giữ
  grade riêng và không làm tăng tỷ lệ đúng. Mở đáp án được đếm riêng.
- `accuracyPercent` = đúng / (đúng + sai); `unassistedRecallPercent` tính cả
  mở đáp án vào số câu chưa tự nhớ được. Không có câu tự động thì tỷ lệ là
  `null`, UI hiển thị `—`; không dùng 0% hoặc 100% thay cho dữ liệu thiếu.
- `elapsedMs` đo thời gian trang còn hiển thị đến câu trả lời đầu tiên; thẻ
  lật đo đến lúc chấm. Tạm dừng khi tab ẩn, cap một giờ, vẫn có thể bao gồm
  thời gian xao nhãng. Một lần mở/tải lại trang là một `sessionId` mới; số
  phiên chỉ đếm các phiên có lượt trong khoảng được chọn.
- Dữ liệu chỉ phản ánh bộ từ và kiểu bài đang học; chưa đủ để xếp CEFR hoặc
  kết luận trình độ ngoại ngữ chung. Thời gian/độ chính xác trong bộ quen có
  thể khác khi dùng từ ở ngữ cảnh mới.

**Dữ liệu cũ:** giữ từ/audio/cả ba lịch ôn. Không thể suy ra đáp án/thời gian
từng lượt trước đây từ các counter, nên không tạo nhật ký giả. Bắt đầu ghi
khi học bằng bản mới. Thay HTML tại cùng tên/vị trí và đóng tab mã cũ trước
khi mở lại; chuyển sang server/origin khác nhập ZIP một lần như trước.

### Persistence, merge và định dạng

`VocabularyDatabase.version(3)` thêm store rỗng
`reviewEvents: &[notebookId+id], notebookId, [notebookId+cardId]`; giữ nguyên
definition/snapshot v1/v2, không có bước viết lại dữ liệu cũ. Log cache trong
trang được cập nhật từng event để không đọc lại toàn bộ lịch sử sau mỗi đáp án.

Event public gồm `id` và `sessionId` (UUID), `cardId`, `occurredAt` (UTC ms),
`mode`, `result` (`correct/incorrect/revealed/self`), snapshot `word`,
`language`, `meaning` (tối đa 200 ký tự), `answer` (300), `elapsedMs`, `grade`
(nullable) và `gradedAt` (0 khi chưa chấm). Không chứa API key, OAuth token,
URL nguồn hoặc toàn bộ đoạn nguồn. Thời gian và snapshot là dữ liệu người học,
không phải chứng chỉ hoặc kết quả kiểm tra có xác thực.

Grade và lịch ôn ghi cùng transaction, retry cùng ID không tăng schedule/log
hai lần. Merge ZIP theo ID, giữ nguyên câu trả lời đầu tiên, ghép grade mới hơn;
ID trùng nhưng nội dung khác bị từ chối và rollback. Import ZIP cũ thiếu log
không xóa log đang có. Chuyển từ mang theo event của từ đó; cùng từ trong hai
sổ có lịch/log riêng. Xóa từ vẫn giữ snapshot lịch sử để báo cáo đúng quá khứ.

ZIP v4 giữ cấu trúc v3, thêm `reviews.json` và `manifest.reviewCount`.
JSON được nén DEFLATE 9; reader kiểm tra schema chặt, count và ID duy nhất,
CRC32, cùng giới hạn tổng nén/giải nén 64 MiB. Log tối đa 20.000 event/16 MiB
mỗi sổ; ledger local tính byte/count, không xuất ledger. Khi đầy, tải báo cáo
rồi dùng **Xóa nhật ký sổ này** (có xác nhận); từ/audio/lịch ôn vẫn còn. Đây là
xóa local, nhập lại ZIP có log cũ sẽ khôi phục log đó. Nếu tổng audio + log
vượt giới hạn xuất ZIP, tải report riêng rồi xóa log hoặc chia nhỏ sổ.

Report `format: read-frog-review-report`, `version: 1`: metadata sổ, timezone,
khoảng thời gian, giải thích các metric, `summary`, `byMode`, `byLanguage`,
`daily`, `words` và `events`. Không import report như một bộ từ; dùng ZIP v4
để chuyển đầy đủ dữ liệu/audio/lịch/log. HTML tự tính report và ghi log trên
file URL hoặc server HTTP(S), không gọi API và không tự gửi dữ liệu ra ngoài.

### Kiểm chứng bản nhật ký — 06/11/2026

- **Đã sửa:** ghi câu kiểm tra đầu tiên, giữ lượt sai bị bỏ qua, tách tự chấm,
  thống kê/nhật ký responsive, report JSON thực tế tải xuống, ZIP v4 portable,
  merge không đếm trùng và grade/schedule atomic. Di chuyển từ mang log; xóa
  log có xác nhận và giữ từ/audio/lịch ôn.
- **Đã kiểm thử:** 4.011 test đạt, 1 test bỏ qua; `SKIP_FREE_API=true` và loại
  free-api live có chủ đích. Format/lint/type-check đạt. Production Edge có
  64 assertion: luồng cũ, đáp án sai chưa chấm vẫn được ghi, JSON summary/raw
  events tải thực tế, không làm tăng accuracy bằng thẻ lật, UI 360/390/768/1280,
  ZIP/log round-trip, merge ZIP cũ không xóa log, chuyển sổ, đóng hẳn rồi mở
  Edge, HTTP offline ghi log/xóa log mà không mất schedule. Unit kiểm tra DB
  v2 thật lên v3 không tạo dữ liệu quá khứ giả, dedup/retry, rollback, limit,
  schema strict, timezone, median và ba kiểu học. API/âm thanh dùng mock.
- **Chưa kiểm thử:** điện thoại vật lý/iOS, server public/HTTPS production,
  API OpenAI live. Thử HTTP bằng server loopback trả đúng HTML; selection PDF
  dùng trang kết quả/fixture, không click context-menu native của hệ điều hành.
- **Bị chặn:** không có. Chưa publish HTML hoặc triển khai cloud sync.

Artifact đã đối chiếu từng file với production build và HTML tải từ extension:

- `ReadFrog-Edge-1.58.0A-ReviewLogs.zip`: 205 file, 6.242.761 byte,
  manifest `1.58.0.8` / `1.58.0A`.
  SHA-256: `F8249DD9AEE0355F728AFD026BE85C531589C33CA6AED18CF58E9871CA899E41`.
- `ReadFrog-OnTuVung.html`: 618.322 byte.
  SHA-256: `8B50FC07F909E0E20C852C6F7ED78EBA459BAF8B37E030D558FB9F9EC1B50EA3`.

## Nén portable: 1.58.0-a.6 / manifest 1.58.0.7

Tiếp tục từ `2d9c8dfa`, nhánh `codex/vocabulary-review`; tên hiển thị vẫn
**1.58.0A**. Database từ vựng giữ version **2**, cấu hình giữ schema **124**;
không sửa snapshot migration đã phát hành hoặc kho credential/TTS playback.

- Audio mới do OpenAI tạo được mã hóa **MP3 mono 64 kbps** ngay trên máy trước
  khi lưu. Giữ model/giọng đã chọn; transport OpenAI/Microsoft hiện tại không đổi.
- Khi xuất sổ cũ, chuyển PCM16 WAV mono/stereo có sample rate được hỗ trợ sang
  MP3 trong bản xuất. Chỉ chọn MP3 khi cả dung lượng raw và DEFLATE nhỏ hơn WAV.
  WAV nhỏ/khác encoding được giữ; ZIP có thể chứa cả WAV lẫn MP3.
- MP3 không bị tái mã hóa khi nhập/xuất lại. Định dạng lossy 64 kbps nhằm giữ
  lời đọc rõ và giảm dung lượng; không tuyên bố bảo toàn waveform như WAV.
- JSON vẫn gọn; ZIP tăng DEFLATE từ **3 lên 9**; chỉ đưa audio đang được dùng
  vào gói và gộp các byte trùng theo SHA-256. Encode chạy tuần tự và nhường UI
  giữa các nhóm frame, trước khi ghi transaction. Tác vụ lưu vẫn hủy được.
- Xuất không sửa dữ liệu gốc, nghĩa/IPA/ví dụ, ID/timestamp thẻ, ID/tên sổ hoặc
  ba lịch ôn. Thư viện WAV đã lưu vẫn giữ nguyên; xuất lại sẽ tối ưu bản ZIP.

### Hợp đồng ZIP v3

```text
Tu-vung-<ten-so>-YYYY-MM-DD.zip
├── manifest.json
├── vocabulary.json
├── progress.json
└── audio/<sha256>.mp3 hoặc audio/<sha256>.wav
```

ZIP32, STORE/DEFLATE chuẩn, không mã hóa mật khẩu hoặc format độc quyền.
Manifest giữ các field v1/v2, `version: 3`; `notebook` giữ UUID/tên/timestamp
nếu có (mọi export từ Sổ từ đều có). Không thêm field vào thẻ/progress đã
phát hành. Audio reference luôn là SHA-256 **byte của file xuất thực tế**;
đổi WAV sang MP3 chỉ đổi reference tương ứng trong bản sao dùng để đóng gói.
Tên file quyết định MIME: `.mp3` = `audio/mpeg`, `.wav` = `audio/wav`.
MP3 do encoder tạo là chuỗi MPEG Layer III frames đầy đủ, không ID3; reader
kiểm tra frame, kích thước, CRC32 ZIP và SHA-256 trước khi lưu. Giữ giới hạn
64 MiB, 2.000 thẻ, 3 MiB/audio và 4 MiB/JSON như trước.

Reader tiếp tục nhận ZIP v1/v2 chỉ có WAV. Reader cũ không đọc được v3 nên
cần cập nhật HTML/extension trước khi chuyển bộ mới. Dữ liệu DB version 2
không cần thay index hoặc chạy lại migration; audio store hỗ trợ thêm MIME.
Đóng các tab HTML/extension cũ khi cập nhật, không dùng mã cũ để xuất dữ liệu
đã lưu bằng bản mới. Snapshot v1-to-v2 giữ nguyên.

### Đưa HTML lên server

Upload nguyên `ReadFrog-OnTuVung.html` lên web server, trả
`Content-Type: text/html; charset=utf-8`. HTML đã nhúng JSZip, encoder MP3,
CSS và notices; không cần cài codec trên server, FFmpeg, WASM, Node API hay CDN.
JavaScript giải nén ZIP và trình duyệt phát audio qua Blob. Không cần key để
nhập, xuất hoặc học. Phục vụ HTTPS khi triển khai; hash cũng có fallback khi
HTTP/file viewer không cung cấp SubtleCrypto. Không áp thêm CSP chặn inline
script/style nếu chưa tách chúng thành file ngoài; CSP bên trong HTML hiện
chặn network khi học. Hosting gzip/Brotli cho HTML là tối ưu transport tùy chọn.

Storage gắn với origin: HTML trên server không tự đọc dữ liệu của bản file://.
Lần đầu chuyển sang server cần nhập ZIP; sau đó cùng origin giữ dữ liệu qua
IndexedDB. Việc này chưa phải sync Drive/OneDrive. Khi thêm sync, nên tách audio
bất biến theo hash khỏi dữ liệu sổ/lịch ôn để chỉ truyền phần thay đổi, còn ZIP
là snapshot portable. Không đưa API key hoặc OAuth token vào bộ từ.

### Kiểm chứng bản nén — 06/11/2026

- **Đã sửa:** encoder MP3 offline độc lập với playback, ZIP v3/DEFLATE 9,
  đọc ZIP v1/v2, tối ưu bản xuất sổ cũ, HTML tự chứa chạy từ file và HTTP.
- **Đã kiểm thử:** 4.001 test đạt, 1 test bỏ qua; `SKIP_FREE_API=true`, loại
  free-api live. Format/lint/type-check và 49 assertion Edge production đạt,
  gồm các luồng nhiều sổ trước đó, nhập v1/v2/v3, MP3 Blob playback offline,
  HTTP import/export/re-encode bằng chính HTML tải từ extension, SHA-256 khi
  không có SubtleCrypto, không gọi server API/CDN khi học. Giữ kiểm tra nâng
  cấp HTML a.4 thật, đóng/mở Edge, ba lịch ôn, popup web/PDF và UI phone.
- **Đo mẫu giọng đọc:** WAV 409.702 byte → MP3 68.736 byte; ZIP cùng sổ từ
  **295.053 → 52.799 byte (giảm 82,1%)**. Mẫu Windows TTS được tạo cục bộ,
  không phải giọng OpenAI; đây là kết quả mẫu, không cam kết mọi sổ giảm như vậy.
  Mẫu tone riêng cũng giảm ZIP 9.488 → 5.452 byte. Gói cài/HTML tăng nhẹ vì
  nhúng encoder; đây là tối ưu dữ liệu sổ, không phải làm gói cài nhỏ hơn.
- **Chưa kiểm thử:** API OpenAI live/chất lượng giọng thật, điện thoại vật lý,
  server public/HTTPS production. HTTP được thử bằng server loopback trả đúng
  HTML, không backend; thiếu SubtleCrypto được mô phỏng trong trang kiểm thử.
- **Bị chặn:** không có. Chưa triển khai sync cloud hoặc publish HTML lên web.

Artifact cuối đã đối chiếu từng file với production build kiểm thử bằng Edge
và HTML tải thực tế từ nút Tải HTML, không chứa credential/profile/fixture:

- `ReadFrog-Edge-1.58.0A-Compressed.zip`: 205 file, 6.233.886 byte,
  manifest `1.58.0.7` / `1.58.0A`.
  SHA-256: `54119BBEF5BC4441FC803CF840DA7EE349F01A941F6554A3E43ECEED59FDA20D`.
- `ReadFrog-OnTuVung.html`: 604.812 byte.
  SHA-256: `15BFBD358403FC816A312F1BDFFEA1B72C0CB2B25C24359493CDA14BFC1B2AF5`.
- Khi cập nhật: đóng các tab cũ, thay HTML **đúng tên/vị trí cũ** để giữ vùng
  IndexedDB, giải nén extension đè thư mục cũ rồi Reload. Lần đầu chuyển HTML
  sang origin server khác cần nhập ZIP một lần.

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
