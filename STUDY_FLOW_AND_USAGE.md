# Đọc, xem và ôn từ — cập nhật 1.58.0-a.17

Tiếp tục từ `014b6ef2` trên `codex/pdf-reading-panel`. Manifest numeric
`1.58.0.18`, tên hiển thị `1.58.0A`. Config124/PDF DB2/image cache DB1 giữ
nguyên; vocabulary thêm DB5, ZIP6; usage có DB1 riêng.

## Từ đang học trên nội dung thật

Popup có **Tô từ trong sổ đang chọn**, mặc định bật. Đối chiếu từ/cụm từ và
biến thể đã lưu của sổ đang chọn, không gọi OpenAI. Đỏ: Cần ôn; vàng: Đang
củng cố; xanh nhạt: Chưa đủ dữ liệu; gạch xanh: Có dấu hiệu nhớ. Phân nhóm
dùng `assessVocabulary` trên toàn bộ logs, không suy ra thuộc từ lần gặp.

Web dùng CSS Custom Highlight ranges, không bọc/tách/thay text node của site.
Không đánh dấu trong link, nút, input, vùng sửa, code/pre hoặc bản dịch do
extension chèn. Scan chỉ vùng gần viewport, tối đa500 range/500 text node/
100.000 ký tự/5.000 node/20ms mỗi đợt, debounce150ms; ưu tiên block đang nhìn.
PDF chỉ quét text layer đã render, giữ giới hạn ba canvas và chữ trong layer
vẫn transparent; nền tô có alpha để không che chữ canvas. PDF native Edge không hỗ trợ đánh
dấu; mở trong trình đọc Read Frog để dùng tính năng này.

Bấm từ trên web/PDF xem nghĩa/trạng thái/lần kiểm tra/ngữ cảnh đã lưu. Trên
phụ đề dùng các span từ đang có; từ đã lưu mở dữ liệu local trước, có nút
**Tra nghĩa mới bằng AI** và thêm câu. Theo dõi focus/storage revision và
refresh30s khi tab hiển thị. Tắt thì dọn ranges và không tải inventory.

## Luyện câu YouTube

Logo Read Frog → **Learning** → transcript → **Luyện nghe từng câu**. Mặc
định tắt, trạng thái không lưu sang video khác. Bật mới nhận J/K/L:
J câu trước, K nghe lại, L câu sau. Không bắt phím trong ô nhập, khi có
modifier, lúc quảng cáo/loading hoặc khi phụ đề đã tắt. Tắt trả phím YouTube.

Lặp1–3 lần, dừng cuối câu, ẩn/hiện bản dịch ở cả overlay và transcript.
Từ build `1.58.0-a.17` / numeric `1.58.0.18`, bật chế độ này mới dùng OpenAI
chia lại **CC native trước tối ưu hiển thị**, bằng model phụ đề đang chọn.
Không phụ thuộc công tắc **AI phân đoạn thông minh** của phụ đề thường.
Ưu tiên câu trọn nghĩa, giữ riêng câu ngắn và không áp giới hạn hiển thị15 từ;
câu quá dài chia ở mệnh đề tự nhiên, tối đa45 giây để luyện. Không gộp lại bằng
optimizer. Chỉ AI chọn chỉ số từ cuối câu: text/timing dựng từ CC; phản hồi thiếu
từ, sai thứ tự, ngoài phạm vi hoặc nối qua khoảng lặng >1.500ms bị từ chối.

Khung Learning hiện câu AI đang luyện, trạng thái chuẩn bị và nút thử lại khi
lỗi. Overlay/transcript/dịch phụ đề thường giữ track riêng. Luồng mới không tạo
CC hay gửi audio, không sửa translation/glossary/stream/queue, không đổi bộ đệm
dịch120s. CC có thời gian từng từ thì giữ; CC chỉ có thời gian cả dòng thì
chia thời gian tương đối theo độ dài chữ và báo rõ **ước lượng**.

Chuẩn bị từng cửa sổ tối đa120s/600 từ/24.000 ký tự quanh vị trí xem, dự trữ
ít nhất vùng120s phía trước khi có dữ liệu. Giữ câu cuối chưa hoàn chỉnh sang
lượt kế tiếp để không cắt cứng tại ranh giới cửa sổ; một cửa sổ tiếp theo có thể
vượt vùng dự trữ120s. Seek xa lấy thêm30s phía trước vị trí tua làm ngữ cảnh.
Chỉ một request chạy tại một thời điểm. Tắt/đổi video/đổi CC/quảng cáo/loading
hoặc ẩn phụ đề hủy port và signal, không áp kết quả muộn, không tự play chỉ vì
bật. Không tự retry trả phí vô hạn, không giả gắn nhãn AI cho cue fallback.
X/Netflix/ani.pm không có controller luyện câu mới.

Cache dùng store `aiSegmentationCache` hiện có, namespace prompt riêng v1,
hash toàn bộ word/timing + profile model/params + credential revision; cache
chỉ lưu JSON ranh giới, không thêm schema/migration/config sync. Cache không
trộn với phân đoạn hiển thị cũ. Usage ghi task segmentation/cached riêng trong
dashboard hiện có. Port chỉ nhận top-frame HTTPS YouTube của đúng extension,
request giới hạn90s, thông báo lỗi không chứa key hoặc raw provider payload.

## Nhiều câu nguồn cho một từ

Trong **Lưu để học**, nếu sổ đã có cùng từ/biến thể, chọn đúng nghĩa rồi bấm
**Thêm câu vào từ đã có**. Không gọi AI hoặc tạo lại audio. Khác nghĩa có thể
chọn **Tạo thẻ cho nghĩa khác**; ID thẻ vẫn theo ngôn ngữ/từ/nghĩa cũ. Nếu AI
sinh trùng ID, giữ thẻ/audio/progress và bổ sung câu mới.

Store DB5 `sources`: `&[notebookId+id], notebookId, [notebookId+cardId]`,
không seed lượt gặp giả cho thẻ cũ. Mỗi câu gồm cardId, context, translation,
title, URL HTTP(S) an toàn, locator(kind/document hash/page/seconds), createdAt.
ID hash theo card/câu chuẩn hóa/URL/locator, độc lập thời gian và notebook.
Một câu trùng giữ lần lưu đầu. Khác câu nhưng trùng ID bị từ chối nguyên giao dịch.
Giới hạn20 câu/từ,20.000 câu/sổ,JSON4MiB và tổng ZIP64MiB.

Sổ từ → **Xem** → **Những câu đã gặp**: mở nguồn video ở mốc thời gian,
về trang trong PDF Read Frog đang mở đúng content hash, hoặc xóa một câu.
Không lưu byte PDF, file handle hoặc đường dẫn; nếu đã đóng PDF phải chọn
lại file trước. HTML độc lập vẫn hiện số trang và nguồn web; không điều khiển
extension từ file HTML. Chuyển/xóa từ chuyển/xóa câu tương ứng; xóa logs không
xóa câu. Gặp lại không thay SRS, correct/incorrect hoặc report3.

Ôn thẻ luân phiên câu theo số lượt ôn; cloze dùng các câu nguồn khác nhau qua
các vòng nếu chứa đáp án phù hợp. Không tạo câu hỏi có đáp án lộ lần thứ hai.
Queue học cũ giữ nguyên prompt; chỉ lượt học mới dùng các nguồn mới.

ZIP6 thêm `sources.json` và `sourceCount`; đọc ZIP1–5, kể cả WAV/MP3 và logs
cũ. Giữ CRC/hash/giới hạn giải nén/identity/audio/progress/event IDs. HTML mới
có cùng reader/writer6, chạy file URL và HTTP(S), không thêm CDN/API/credentials.
Khi cập nhật hãy thay cả HTML ôn từ; HTML cũ chưa đọc được ZIP6 hoặc DB5.

## Usage, tốc độ và phí ước tính

Popup → **Chi phí và tốc độ OpenAI**. DB `read-frog-api-usage` v1 chỉ có
`entries`, `prices`, `meta`; tối đa20.000 lượt/90 ngày. Không lưu prompt,
response text, URL, headers, credentials hay lỗi SDK. Không gửi telemetry.
Middleware AI SDK v4 model ghi từng lần gọi thật, giữ delta/cancel/backpressure;
input total bao gồm cached input và output total bao gồm reasoning, không cộng
lần nữa. Ghi duration, first text/reasoning delta, task/model/status. Cache local
của page/subtitles/PDF/image được ghi riêng, không giả là OpenAI prompt cache.

TTS ghi request/duration, PCM duration theo chunks WAV, token Realtime nếu API
trả về. WAV speech không trả token thì để null. Giá audio/phút tự nhập chỉ là
ước tính theo độ dài audio, không phải số liệu hóa đơn hoặc giá token audio.

Dashboard có lọc ngày/model, nhóm tác vụ, median/p95, export JSON1, giá riêng,
ngân sách tháng cảnh báo (không hard cap), xóa logs có epoch ngăn request cũ
ghi trở lại. Giá Standard ngữ cảnh ngắn có ngày đối chiếu; không tự đổi model.
Model lạ, usage thiếu, cache-write hoặc ngữ cảnh dài để chưa định giá. Tổng
USD là phần đủ dữ liệu; số lượt chưa định giá luôn hiện cạnh tổng, không coi0.
Thay giá sẽ tính lại ước tính cho các logs đang giữ. Không suy diễn logs quá khứ.

Nguồn: [OpenAI pricing](https://developers.openai.com/api/docs/pricing),
[prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
và docs/source AI SDK đi kèm phiên bản cài trong repo.

## Kiểm chứng cập nhật a.17 — 07/11/2026

- Production Edge `156.0.4314.58`: **39 assertion** của `check-study-flow.mjs`
  đạt, gồm tắt không gọi AI, bật dùng model phụ đề, J/K/L/lặp/auto-pause, giữ
  riêng “Yes.” và “I agree.” trong cùng CC, ghép mệnh đề qua hai cue, không
  cắt câu >15 từ, cache bật lại không trả phí thêm, ad/input/SPA guards,
  source passages/1.000 từ/usage và PDF highlights/jump. Đã sửa lỗi seek
  làm tròn microsecond khiến quay về câu trước khi cắt bên trong CC.
- **80 assertion** PDF/image regression đạt, có prompt ghi cứng Chinese
  không chứa token ngôn ngữ, chọn Việt/Anh và cache riêng; OCR không upload
  lại. Không chạy lại benchmark độ trễ lịch sử a.12 trong lần kiểm này.
- Unit suite/lint/type/format được chạy với `SKIP_FREE_API=true`; test live
  free-api chủ động loại. API/model và DOM YouTube trong browser là fixture;
  MP4, media seek/play, extension runtime, private credential routing và
  IndexedDB/cache/UI đều thật. **Chưa kiểm chứng chất lượng chia câu/dịch của
  OpenAI thật hoặc live YouTube**; không dùng key của người dùng.
- Config124/PDF DB2/image DB1/vocabulary DB5/ZIP6/Edge sync1 giữ nguyên;
  HTML ôn từ giữ SHA-256 `ecc40069a312ad4a274606d42dcf57db7186c7c1bea1b162e64adadf5f2dd589`.
- ZIP **429/429 file** khớp byte với build đã test, CRC đạt, **8.745.404 byte**,
  tăng4.247 byte so với EdgeSync. `ReadFrog-Edge-1.58.0A-YouTubeAI-FixImage.zip`,
  SHA-256 `d4e947a7a2bc5f4b22ff70cf215136ed9030b523c6f2d8c9e558b0943394e165`.
  Evidence local: `.codex/study-flow-1794028819970`,
  `.codex/pdf-reading-1794028662563`. Không có chặn kỹ thuật còn tồn tại.

## Kiểm chứng bản a.15 — 07/11/2026

- Source: **4.145 test đạt, 1 bỏ qua**, 410 file đạt/1 file bỏ qua;
  `SKIP_FREE_API=true`, loại test live free-api. Lint/type-check và format đạt.
- Production Edge 156, profile riêng: **32 assertion** cho bốn tính năng mới;
  source attach/dedup giữ nguyên progress, 1.000 từ chưa kiểm tra vẫn chưa đánh
  giá, bounded highlights không thay text node/listener, tắt dọn ranges, local
  lookup không gọi AI, usage lấy token thật từ response fixture và không lưu text.
  Viewport dashboard 390/760/1280, giá riêng, cache/ngân sách, J/K/L với media
  MP4 thật, lặp hai lần, checkbox/input/ad guards, ẩn/hiện dịch, chuyển video
  tắt luyện câu, PDF highlight trong suốt và jump đúng hash/trang đều đạt.
- **70 assertion** cho save qua web/Dictionary/native result, sổ riêng,
  ZIP6 mang nguồn, HTML mobile offline, MP3, ba kiểu ôn, logs/report, import
  legacy, migration và persistence qua restart/HTTP. **77 assertion** hồi quy
  PDF/history/autosave/capture/OCR/cache/shortcut; không đổi engine dịch.
- **25 assertion** scale: 1.000 từ, 2.000 MP3 riêng, 9.000 đáp án. Nhập
  10.059 ms, tìm 83 ms, MD 177 ms, JSON 244 ms, ZIP 1.876 ms; heap sau GC
  qua 12 lần đổi tab tăng 35.300 byte trong lần đo này. Đây là fixture trên
  máy kiểm thử, không phải cam kết cho mọi điện thoại.

Script tái lập: `scripts/debug/check-study-flow.mjs`, `check-vocabulary.mjs`,
`check-vocabulary-scale.mjs`, `check-pdf-reading.mjs`. Evidence local nằm trong
`.codex/study-flow-*`, `vocabulary-check-*`, `vocabulary-scale-*`, `pdf-reading-*`.
YouTube dùng DOM/MAIN bridge/CC fixture và MP4 thật, **chưa kiểm tra live YouTube**.
OpenAI được mô phỏng, không dùng key người dùng hoặc gọi trả phí; số latency
trong dashboard fixture không phản ánh tốc độ model thật. Chưa kiểm tra điện
thoại vật lý hoặc mọi website; PDF native Edge không có text-layer highlights.
Không có chặn kỹ thuật còn tồn tại trong bốn phần này.

ZIP đã đối chiếu CRC và **426/426 file** với build đã kiểm thử, không kèm
profile/fixture/key/source map. `ReadFrog-Edge-1.58.0A-StudyFlow.zip`:
**8.732.453 byte**, tăng 28.691 byte (~0,33%) so với LanguageOrder.
SHA-256 `75a5d93a3d010f1d45d50fc0f6354c3dc10ee04d5547d0f92129048d093a1ec0`.
HTML độc lập **657.779 byte**, SHA-256
`ecc40069a312ad4a274606d42dcf57db7186c7c1bea1b162e64adadf5f2dd589`.
Thay HTML cũ bằng bản này để đọc ZIP6. API key không nằm trong hai artifact.

PDF source navigation dùng runtime message có `targetTabId`: extension page
không phải receiver của `tabs.sendMessage`. Reader khác không trả lời để tránh
first-response race; kiểm tra đúng document hash và số trang trước khi navigate.
