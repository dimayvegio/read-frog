# Nâng cấp upstream 1.58.1 → local 1.58.1A

- Ngày xác minh release: 09/11/2026. GitHub `releases/latest` trỏ tới
  [v1.58.1](https://github.com/mengxi-ream/read-frog/releases/tag/v1.58.1).
- Local bắt đầu tính năng Audio: `1ea3c17e`; commit Audio trước merge:
  `6bb2038a`, trên nhánh `codex/pdf-reading-panel`.
- Upstream trước: `v1.58.0` / `48dccd04cfdf8432994608215ccad6db329f952b`.
- Upstream nhận: `v1.58.1` / `8f015c4a830951dd98fd836989e7348849e60cea`.
- Nhánh kết quả: `codex/upstream-1.58.1-openai`; merge giữ ancestry của cả fork
  và upstream. Không thay source local bằng checkout upstream.
- Merge commit đã xác minh: `74e721a9c110526d17e7d8a3aa3e28644b1b18d7`,
  hai parent là `6bb2038a815ee4bec7970063b0f1423e7cfa23a2` và tag upstream trên.
- Package `1.58.1-a.1`; manifest numeric `1.58.1.1`; `version_name:1.58.1A`.

## Quyết định nhận thay đổi upstream

| Commit                                                     | Nhóm        | Quyết định                   | Cách giữ fork / kiểm thử                                                                                                                                                                          |
| ---------------------------------------------------------- | ----------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `174027d2` / #2477: menu theo logo Read Frog               | F04/F07/F08 | Nhận                         | Button ref, clamp trong player, ResizeObserver; giữ iframe ani.pm và dismiss/geometry local; menu-placement/navigation tests                                                                      |
| `96ba141f` / #2475: dùng lại cache khi xem lại sau refresh | F03/F04/F15 | Điều chỉnh trên runtime fork | Key theo transcript đầy đủ + prompt/glossary/model/ngôn ngữ/content-aware, bỏ metadata DOM dễ đổi; request vẫn có ngữ cảnh thật; giữ private credential identity của background; translator tests |
| `da75567e` / #2469: thay host do instance đã chết để lại   | F04/F06/F08 | Nhận                         | Overlay/sidebar/toast theo reference, dọn host cũ; giữ Learning kéo/resize, fullscreen, persistence và cleanup; renderer tests + production study-flow                                            |
| `8f015c4a`: release metadata                               | F18         | Điều chỉnh                   | Giữ changelog upstream và lịch sử local; version A/numeric hợp lệ, không thêm production manifest key                                                                                             |

Không có patch chức năng nào trong ba patch trên bị bỏ qua hoặc chưa port.
Không có dependency hoặc migration mới trong đợt upstream này. Không khôi phục
hosted provider, tài khoản/cloud/Notebase/telemetry hoặc Send feedback đã gỡ.
Cache key phụ đề thay đổi: lượt đầu sau nâng cấp có thể cần dịch lại; các lượt
xem sau dùng key ổn định qua refresh. Không sửa nội dung hoặc schema cache cũ.

## Đã sửa

- Thêm **F23 Audio → Văn bản** trước khi merge: trang tải audio, preview local,
  hàng đợi, streaming chữ, sửa/copy/TXT/ZIP; default hints Anh/Trung/Nhật/Việt
  và preset Anh–Nhật, Anh–Nhật–Việt, Anh–Trung. File dùng `gpt-transcribe`.
- Thu âm tab video/MP3 trong offscreen, tiếp tục dùng tab khác; hai chế độ thu
  trước rồi chuyển và live bằng `gpt-live-transcribe`/WebRTC. Có bắt đầu/dừng
  rõ ràng; không thu micro hoặc tự thu khi mở video. Khai báo `tabCapture`
  cùng extension, giữ activeTab invocation và one-use owner/source guards.
- Live hiển thị partial/final, chốt lượt local, private SDP/token exchange,
  không trả key cho UI/offscreen, không tự paid retry; cleanup và giới hạn
  RAM/thời gian. Hợp đồng chi tiết: [AUDIO_TRANSCRIPTION.md](AUDIO_TRANSCRIPTION.md).
- Nhận đủ ba sửa lỗi upstream ở bảng trên. Giữ buffer 120.000ms tại 1×,
  processing chunk 60.000ms, batch5, track AI luyện câu riêng và window Learning.
- Conflict chỉ ở package version/changelog. Các file tự merge cũng đã rà lại,
  nhất là sidebar geometry, panel/iframe, subtitle cache và private runtime.

## Đã giữ

Giữ F01–F23 trong [FORK_DIFFERENCES.md](FORK_DIFFERENCES.md) và AGENTS: engine
DOM/HTML/glossary/queue/streaming, private OpenAI credentials, Microsoft/OpenAI
TTS và MP3, PDF selection/reader/resume/song ngữ, OCR/cache, HTML song ngữ,
ani.pm/X/Netflix, sổ từ/HTML mobile/logs, Edge config sync và Phát âm response v2.

Config124; credential DB1; AppDB6; PDF DB2; image DB1; vocabulary DB5/ZIP6/report3;
reading DB1/ZIP1; pronunciation DB1/report1; usage DB1 và sync DB1/transport1 đều
giữ nguyên. Không sửa migration đã phát hành hoặc đưa audio/transcript vào các
kho dữ liệu/sync này. HTML ôn từ giữ nguyên SHA-256
`a640c20d7aa510642dbda1dd59411e41c0660670ae2a97594d3654ab56aedb64`.

## Đã kiểm thử

Runtime Node **26.13.0**, pnpm **12.16.1**, production build dành cho Edge.
Browser regression dùng **Chrome 156.0.8078.80**, profile riêng, fixture/key giả,
không đọc hoặc dùng key/profile thật của người dùng.

- Lint/type-check, format, `git diff --check` và `pnpm zip:edge` đạt.
- Full unit: **4.336 đạt, 1 bị gate bỏ qua**, 443 test files đạt/1 skipped.
  `SKIP_FREE_API=true`; `free-api.test.ts` loại có chủ đích theo AGENTS.
  Lượt kiểm cuối đọc lại Nx cache đúng source sau lượt thực chạy 67,67s;
  không cộng cache hit thành một lượt chạy test mới.
- Upstream-focused suites: **46 tests đạt** cho renderer/menu/navigation/cache.
- Audio + update: **24 assertions đạt** trên JS/manifest thật của build, gồm
  source invocation, capture oscillator thật, tab khác vẫn thao tác được,
  WebM decode được, native WebRTC audio tới peer local, partial/final, cancel,
  đóng owner dọn tracks, UTF-8 TXT, mobile, credentials và model/language hints.
  Chữ/API/SDP provider mô phỏng; không phải thử độ chính xác hoặc độ trễ OpenAI.
- **Update-in-place**: cài ZIP `1.58.0A-Pronunciation-Tab` vào thư mục test một
  lần, ghi key giả/config riêng, chép đè build mới và reload cùng thư mục qua
  CDP `Extensions.loadUnpacked`. Cùng ID, version lên `1.58.1.1`, config giữ
  byte-identical và private key/revision vẫn còn. Worker mới được chọn riêng;
  không dùng handle của worker cũ sau reload.
- Study-flow: **59 assertions**, notebook fixture1.000 từ, highlights/sources,
  usage, AI sentence opt-in, window drag/resize/keyboard/persistence/fullscreen.
- HTML song ngữ: **26 assertions**; PDF song ngữ: **33 assertions**; Phát âm:
  **37 assertions**, gồm tab launcher, từ đơn, local silence stopping và cleanup.
- ZIP: CRC đạt, **454 files**, từng file byte-identical với build, manifest tại
  root, numeric/version_name đúng, không production key, profile, `.env`, PEM,
  test source hoặc sentinel credential.

## Chưa kiểm thử

- OpenAI API thật: độ chính xác họp đa ngôn ngữ/giọng nói, latency và hóa đơn.
  Live usage chưa có server duration tổng hợp nên cost vẫn unknown; giá UI là
  tham khảo, không phải phép đo chi phí. Không gọi API trả phí để chạy regression.
- Tương tác native Edge/cấp quyền trong profile đang dùng; tài khoản/video thật
  trên YouTube, X, Netflix/ani.pm, Bilibili, Udemy/edX; Firefox/Safari.
- Giao diện permission/update của Edge thật; update đã kiểm bằng API Chrome
  trong profile test. Quyền mới `tabCapture` có thể cần người dùng chấp nhận
  tùy trình duyệt; không cần gỡ/cài lại hoặc đổi ID.
- Đồng bộ Microsoft cloud hai máy, thiết bị phone thật và context menu native
  PDF bằng chuột: không suy từ unit/fixture thành đã thử thực tế.

## Bị chặn

Không có blocker triển khai/merge/đóng gói. Harness khởi chạy Edge trên máy
này thoát trước khi kết nối DevTools (đã thử pipe/port và executable hiện có),
nên browser regression chuyển sang Chrome. Giới hạn kiểm thử Edge được giữ
ở mục chưa kiểm thử, không báo là đã đạt.

## Bàn giao

- Một file: `C:/Users/TIEN/Downloads/ReadFrog-Edge-1.58.1A.zip`.
- Dung lượng **9.009.720 byte**, SHA-256:
  `4d904e997690de28d31f82d9d41b76fd25eb6cfa26af515e1ac9900728decd72`.
- Giải nén đè vào **đúng thư mục Edge đang nạp**, mở `edge://extensions` và
  Reload Read Frog; tải lại trang đang dùng. Không uninstall/đổi thư mục.
- Popup → **Audio → Văn bản**. Muốn thu video, mở popup tại tab nguồn, vào
  trang Audio rồi chọn chế độ và bắt đầu. File/text chỉ ở RAM, tải TXT trước
  khi đóng trang. API key vẫn cấu hình tại OpenAI Settings của extension.
