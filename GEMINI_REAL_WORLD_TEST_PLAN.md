# FlowRead — hướng dẫn Gemini kiểm thử sử dụng liên tục

**Cập nhật A.19 (16/11/2026):** đồng bộ Edge đã gỡ; dùng S21 và [hợp đồng gỡ tính năng](EDGE_SYNC_REMOVAL_A19.md), không chạy harness transport đã xóa. Các mốc bên dưới là lịch sử.

Mốc soạn: 15/11/2026. Đối chiếu repository ở commit `310c785e`, tag `v1.59.3A.9`, package `1.59.3-a.9`, manifest numeric `1.59.3.9`, display `1.59.3A`. Khi chạy trên commit khác, ghi lại HEAD thực tế; không âm thầm checkout hoặc reset về mốc này.

Đây là **kế hoạch kiểm thử**, không phải báo cáo các kịch bản dưới đây đã chạy. Bản A.9 trước đó có 4.701 tests đạt/1 skip và 16 assertions HTML production với API mock; những con số ấy không chứng minh đã qua soak test hai giờ hoặc OpenAI thật.

## 1. Prompt giao việc cho Gemini

Copy đoạn dưới vào Gemini có quyền đọc repo, chạy terminal và điều khiển trình duyệt thử nghiệm:

> Bạn là QA engineer cho FlowRead. Đọc AGENTS.md và toàn bộ GEMINI_REAL_WORLD_TEST_PLAN.md trong repo trước khi thao tác. Kiểm thử bản production bằng kịch bản thực tế lặp lại, tập trung API bị gọi thừa, kết quả cũ đè kết quả mới, mất dữ liệu, âm thanh trùng, CPU/RAM/listener tăng và sai quyền sở hữu tab/document.
>
> Làm lần lượt: kiểm tra môi trường → unit/lint/build/audit → regression có sẵn → bổ sung harness lặp lại và lỗi mạng → phiên sử dụng liên tục 120 phút. Ưu tiên S02, S03, S04, S09, S13, S16, S19 và S22. Không chỉ chạy unit rồi kết luận toàn bộ extension tốt. Chạy từng browser test tuần tự, ghi rõ phần có sẵn và phần mới tự viết; không biến một bài test một vòng thành bằng chứng 100 vòng.
>
> Mặc định toàn bộ provider dùng mock và dữ liệu tổng hợp. Chỉ chạy OpenAI thật nếu chủ dự án đã cấp rõ ngân sách/phạm vi riêng; không lấy key từ profile chính. Dùng profile thử nghiệm tách biệt, có một profile được giữ qua các lần đóng/mở để thử persistence. Không tác động Edge đang dùng, không xóa/cài lại extension chính hay dữ liệu, không copy đè thư mục cài chính trong công việc QA này. Nếu không có công cụ thì đánh dấu BLOCKED, không giả vờ đã bấm/chạy/nghe.
>
> Khi thấy lỗi, lưu bằng chứng và thu nhỏ ca tái hiện, chạy lại tối đa ba lần để đo tần suất. Không tự sửa production, schema/migration/permissions, không commit/push/tag/build ZIP phát hành chỉ để làm test xanh. Có thể tạo fixture/harness/báo cáo QA trong thư mục riêng. Không tắt assertion, không nới threshold âm thầm. Báo cáo ưu tiên P0–P3 kèm các bước, expected/actual, số request, metrics và đường dẫn bằng chứng. Phân biệt PASS/FAIL/BLOCKED/NOT_RUN; không coi timeout hay bỏ qua là PASS.

## 2. Phạm vi, môi trường và dữ liệu

### 2.1 Quy tắc chạy

- Đọc [AGENTS.md](AGENTS.md), [FORK_DIFFERENCES.md](FORK_DIFFERENCES.md), [HTML_SELECTION_CACHE_A9.md](HTML_SELECTION_CACHE_A9.md), [HTML_FIXED_PANE_AUDIO_A8.md](HTML_FIXED_PANE_AUDIO_A8.md). Dùng tài liệu tính năng tương ứng để xác định giới hạn thật, không suy đoán từ screenshot.
- Test production `.output/edge-mv3`, không dùng dev server làm bằng chứng phát hành. Chrome chạy gói Edge MV3 là một kết quả Chrome; phải test Edge riêng mới được ghi Edge PASS.
- Lượt kiểm thử A.7/A.8 từng bị Edge mới mở rồi thoát trước khi load extension. Nếu còn xảy ra: lưu exit/log/version, ghi BLOCKED môi trường; không kết luận extension crash, không chuyển sang profile Edge chính để né lỗi.
- Hai kiểu profile: **cold** mới hoàn toàn và **warm** giữ nguyên ID/config/IndexedDB qua restart. Không trộn số đo hai kiểu. Không bật sync tài khoản thật trong profile QA.
- Một lượt trình duyệt tại một thời điểm; không rebuild `.output` khi browser đang đọc bản ấy. Dùng lock trong runner, `try/finally` để đóng browser/server/stream do test tạo. Khi script con timeout, đóng đúng process tree của lần test, không kill mọi Chrome/Edge trên máy.
- Mock Responses/TTS/transcription tại private provider boundary tương tự harness có sẵn. Mock không được chạy vào mạng OpenAI thật. Đừng chỉ chặn fetch ở trang HTML: request có thể xuất phát từ service worker, offscreen hoặc WebRTC.
- Dùng đúng luồng UI/message thật để đưa yêu cầu vào extension; không set thẳng output React rồi coi như đã kiểm thử dịch. Seed fixture/mock credentials chỉ trong profile QA, không thay logic production.
- Native menu chuột phải, phím tắt cấp browser, PiP, microphone permission và hành vi âm thanh cần đúng loại thao tác/user gesture. Nếu công cụ không điều khiển được, kiểm phần bridge bằng test riêng và ghi phần tương tác OS là NOT_RUN; DOM `.click()` không chứng minh native menu hoạt động.

### 2.2 Bộ fixture nên chuẩn bị

| Mã  | Nội dung                                                            | Mục đích                                   |
| --- | ------------------------------------------------------------------- | ------------------------------------------ |
| H1  | Bài báo HTML tĩnh, 30 đoạn, EN/VI/zh/ja, link/list/table/code       | Dịch/chọn từ, dấu Việt, cache, giữ DOM     |
| H2  | SPA đổi route/hash, React rerender, danh sách thêm/xóa node, iframe | Ownership, stale result, observer/listener |
| P1  | PDF có text, 10 trang, heading/bullet/bảng/code/link/outline        | Reader/search/annotation/song ngữ          |
| P2  | PDF scan 20 trang, EN/VI/zh/ja, có vài trang trắng                  | Local OCR và dải trang                     |
| P3  | PDF text 500–1.000 trang, kích thước trang khác nhau                | Render/cache/search lớn, resume            |
| P4  | File đổi tên nhưng byte giống P1; file cùng tên nhưng byte khác     | Identity theo hash, không theo tên         |
| V1  | Video tổng hợp có CC và hai người nói, transcript/đổi cảnh rõ       | YouTube/ani.pm fixtures, lồng tiếng        |
| V2  | Video dài hơn 10 phút, có đoạn im lặng/ad/CC đổi track mô phỏng     | Buffer/capture/cancel/phân tích            |
| A1  | Audio nhiều ngôn ngữ + im lặng, đáp án transcript có timecodes      | ASR, final/partial, SRT                    |
| N1  | Sổ 1.000 từ, audio khác nhau, lịch sử đúng/sai/hint                 | Import/export/SRS/report/performance       |

Dùng nội dung tự tạo/được phép sử dụng. Khởi đầu từ fixture trong `scripts/debug`, đừng dùng tài liệu riêng, cuộc họp thật hoặc dữ liệu nhạy cảm để tạo báo cáo công khai. Video oscillator hiện có xác minh capture/timing, **không** xác minh chất lượng nhận diện người nói hay phát âm.

### 2.3 Chuẩn bị terminal PowerShell

```powershell
Set-Location 'C:\Users\TIEN\Documents\ChatGPT\read-frog'
git status --short
git rev-parse HEAD

# Dùng pnpm wrapper đang có ở máy này nếu tồn tại.
$qaTools = Join-Path (Get-Location).Path '.codex/pnpm-tools'
if (Test-Path -LiteralPath $qaTools) { $env:PATH = "$qaTools;$env:PATH" }
$env:NX_DAEMON = 'false'
$env:SKIP_FREE_API = 'true'
$env:VOCAB_BROWSER = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

pnpm exec node --version
pnpm --version
Test-Path -LiteralPath '.codex/browser-harness/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'
Get-Command ffmpeg,ffprobe -ErrorAction SilentlyContinue
```

Trên máy soạn, harness riêng dùng `puppeteer-core@24.31.0`; nhiều script trỏ cứng vào `.codex/browser-harness/...` và Chrome Windows. `.codex` không nằm trong source phân phối. Nếu thiếu: chuẩn bị harness local với phiên bản tương thích có `browser.installExtension`, không thay lockfile/dependencies production. Có thể cài vào thư mục QA riêng, sửa **bản sao harness QA** để trỏ đúng module/browser. Không tự cập nhật toàn bộ dependencies. Một số script hỗ trợ `VOCAB_PUPPETEER_MODULE`, một số không: đọc entrypoint trước khi chạy.

Nhiều script mặc định Edge; `VOCAB_BROWSER` đổi sang Chrome ở các script có đọc biến này. `check-html-fixed-pane.mjs` hiện dùng đường dẫn Chrome cố định. `check-video-dubbing.mjs` cần `ffmpeg` trên PATH; TTS/reading-lab có thể cần `STUDY_FFPROBE` trỏ `ffprobe.exe`. Không có media tool thì ghi phần audio decoding BLOCKED thay vì skip assertion. Không tự đụng `$HOME`, `$CODEX_HOME` hay profile mặc định.

## 3. Chạy bộ kiểm tra nền và harness hiện có

### 3.1 Kiểm tra nguồn và build, giữ nguyên exit code

Chạy từng lệnh, lệnh lỗi thì lưu log và xử lý nguyên nhân trước khi đi tiếp:

```powershell
pnpm exec nx fmt:check --output-style=static
pnpm exec nx lint --output-style=static
pnpm exec nx test --output-style=static -- --exclude="**/free-api.test.ts"
pnpm build:edge
Get-Content '.output/edge-mv3/manifest.json' | ConvertFrom-Json |
  Select-Object name,version,version_name,permissions
pnpm exec node scripts/debug/audit-runtime-network.mjs
$env:STORE_REQUIRE_SCREENSHOTS = 'true'
pnpm exec node scripts/debug/audit-store.mjs
```

`free-api.test.ts` là test dịch vụ ngoài, chủ động bỏ theo AGENTS. Nx có thể trả cache: ghi rõ cache hit; nếu cần chứng minh vừa thực thi trên môi trường mới dùng `--skip-nx-cache`, không chạy lại toàn suite vô ích nhiều lần. Audit tĩnh không thay cho network/payload runtime. Không chạy `zip:edge` trong nhiệm vụ viết/chạy QA này, để tránh kích hoạt workflow cập nhật cài chính.

### 3.2 Regression production có sẵn

Chạy tuần tự, mỗi lệnh lưu stdout/stderr, exit code, thời gian, thư mục evidence mà script in ra. Mặc định các bài dưới dùng fixture/mock; vẫn phải đọc script/private mock trước để chắc không có fallback gọi thật. Chúng thường tạo profile mới cho mỗi lần: lặp script 100 lần **không** thay thế 100 thao tác trong cùng phiên.

| Lệnh `pnpm exec node ...`                       | Phần cần kiểm tra                                     |
| ----------------------------------------------- | ----------------------------------------------------- |
| `scripts/debug/check-html-fixed-pane.mjs`       | Pane HTML thật, highlight, chuyển mode/cache A.9      |
| `scripts/debug/check-web-bilingual.mjs`         | Khung song ngữ HTML/restore                           |
| `scripts/debug/check-pdf-study.mjs`             | PDF search/drawing/note/OCR local                     |
| `scripts/debug/check-pdf-workspace.mjs`         | Gộp/tách/exclude/bookmark/ink workspace               |
| `scripts/debug/check-pdf-bilingual.mjs`         | PDF song ngữ/scroll/cancel/cache                      |
| `scripts/debug/check-pdf-reading.mjs`           | Selection PDF và image capture/fast image helpers     |
| `scripts/debug/check-video-dubbing.mjs`         | Lồng tiếng, capture/analysis, mix/offset              |
| `scripts/debug/check-audio-transcription.mjs`   | File/live capture/source pane/SRT theo flags          |
| `scripts/debug/check-pronunciation.mjs`         | Trang phát âm, recording/feedback/report              |
| `scripts/debug/check-tts-download.mjs`          | MP3 download/playback isolation                       |
| `scripts/debug/check-reading-lab.mjs`           | Thư viện đoạn, nghe/record/export                     |
| `scripts/debug/check-study-flow.mjs`            | Listening/saved-word highlights/usage                 |
| `scripts/debug/check-vocabulary-scale.mjs`      | 1.000 từ, audio/history/report/round trip/mobile      |
| `scripts/debug/check-settings-sync-removal.mjs` | Gỡ sync; nâng cấp A.18, giữ file backup/import/export |

`check-image-translation.mjs`, `check-fast-image.mjs`, `check-pin-srt.mjs` là **helper có export**, không chạy riêng rồi thấy exit 0 mà kết luận đã test. Image helpers chạy qua `check-pdf-reading.mjs`; pin/SRT qua Audio với `AUDIO_PIN_SRT=1`.

`check-vocabulary.mjs` còn có ca nâng cấp dùng ZIP cũ mặc định `.output/read-frogextension-1.58.0-a.4-edge.zip`. Nếu muốn chạy ca ấy, cung cấp đúng artifact cũ qua `VOCAB_BASELINE_ZIP` và kiểm manifest/hash; **không lấy ZIP hiện tại đóng giả baseline cũ**. Thiếu artifact thì ghi riêng phần upgrade BLOCKED.

Các biến thể nên chạy trong shell sạch hoặc xóa flags giữa lượt:

```powershell
# YouTube: capture thật từ fixture tổng hợp, provider giả lập.
$env:DUBBING_PLATFORM = 'youtube'
$env:DUBBING_CAPTURE = '1'
$env:DUBBING_AUTOMATIC = '1'
$env:DUBBING_SAMPLE_SECONDS = '30'
pnpm exec node scripts/debug/check-video-dubbing.mjs

# ani.pm: script mặc định là ani.pm khi không chọn youtube.
Remove-Item Env:DUBBING_PLATFORM -ErrorAction SilentlyContinue
$env:DUBBING_SAMPLE_SECONDS = '15'
pnpm exec node scripts/debug/check-video-dubbing.mjs
Remove-Item Env:DUBBING_CAPTURE,Env:DUBBING_AUTOMATIC,Env:DUBBING_SAMPLE_SECONDS -ErrorAction SilentlyContinue

# Chạy từng biến thể Audio độc lập, không gom mọi flag vào một lượt.
$env:AUDIO_PIN_SRT = '1'
pnpm exec node scripts/debug/check-audio-transcription.mjs
Remove-Item Env:AUDIO_PIN_SRT -ErrorAction SilentlyContinue

$env:AUDIO_FACEBOOK = '1'
$env:AUDIO_VIEW_RECOVERY = '1'
pnpm exec node scripts/debug/check-audio-transcription.mjs
Remove-Item Env:AUDIO_FACEBOOK,Env:AUDIO_VIEW_RECOVERY -ErrorAction SilentlyContinue

$env:AUDIO_SOURCE_VIEW = '1'
$env:AUDIO_SPA_SOURCE = '1'
pnpm exec node scripts/debug/check-audio-transcription.mjs
Remove-Item Env:AUDIO_SOURCE_VIEW,Env:AUDIO_SPA_SOURCE -ErrorAction SilentlyContinue
```

Facebook/YouTube trong harness là fixture intercept, không phải bằng chứng đã test site/account live. Với website thật: ghi URL thử, ngày, player/CC/server mode, ad/account/network; không vượt CAPTCHA/DRM/đăng nhập hoặc tự đổi HARD sang SOFT hộ người dùng. Thiếu điều kiện thì BLOCKED riêng site.

## 4. Instrumentation phải bổ sung cho test lặp lại

Tạo harness QA riêng dưới `.codex/qa-flowread-<timestamp>/`; nếu cần chia sẻ, chuyển script tổng quát không bí mật vào thư mục QA được review. Dùng `check-html-fixed-pane.mjs`, `pdf-worker-fixture.mjs` và các harness tương ứng làm nền. **Viết driver lặp thao tác trong cùng browser/profile**, không chỉ bọc lệnh bằng vòng for.

### 4.1 Đếm request đúng nơi

- Gắn bộ đếm tại boundary provider trong service worker/private runtime: phân biệt translation, explanation, summary, OCR/vision, TTS, audio analysis, ASR, pronunciation. Đếm cả start/complete/cancel/failure; một request hủy sau khi gửi vẫn có thể đã tính phí.
- Phân biệt network request với job UI; cache hit không được tính là provider completion/usage mới. Tách fetch và session/WebRTC. Một phiên ASR dài không phải một request text cho mỗi câu.
- Mock có request ID, latency và output đánh dấu riêng từng input để phát hiện A đè B. Chặn egress provider thật trong profile thử. Log chỉ metadata/hash/byte count/loại payload, không Authorization/key/audio/nội dung riêng tư.
- Dùng `getOpenAIKeyStatus` revision giả ổn định trong bài warm-cache. Đổi revision qua thao tác có chủ đích khi test invalidation; đừng tạo revision mới ở mỗi lần restart rồi kết luận cache hỏng.
- Chuẩn bị mock success, stream chậm, 401, 429, 500, timeout, JSON sai, output rỗng, partial rồi disconnect và response đến sau abort. Thời gian/seed có thể tái lập.

### 4.2 Số đo mỗi 5 giây và ở cuối mỗi 10 vòng

Ghi JSONL: timestamp, scenario, cycle, active feature/tab, requests theo task, in-flight, cache hit, UI response time, JS heap, DOM/listeners, renderer CPU và OS memory nếu đo được. Các giá trị chưa đo được phải là `null`/unknown, không là 0.

Đo riêng source page, pane/extension page và worker/offscreen. Main document DOM không bao hết shadow DOM/iframe; dùng CDP `Nodes`/`JSEventListeners` và inventory host riêng để bổ sung. Ví dụ trên một `page` Puppeteer:

```javascript
const cdp = await page.createCDPSession()
await cdp.send("Performance.enable")
const metrics = Object.fromEntries(
  (await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]),
)
// JSHeapUsedSize: byte, TaskDuration: giây tích lũy, không phải % CPU.
// Bổ sung sampling targets khác; không gọi đây là RAM toàn extension.
```

- Đo latency với `performance.now()` ở driver: click → output đầu tiên, click → hoàn tất; live: chốt câu → bản dịch hoàn tất. Dùng p50/p95/max và số mẫu, không chỉ một lần nhanh nhất.
- Với fixture chứa đáp án audio, có thể đo speech-end → final; trên site thật không có ground truth thì đừng gộp độ trễ ASR và translation thành một số đo thiếu nguồn.
- Warm-up 5 vòng, đo các vòng sau; giữ fixture/cấu hình/browser/viewport cố định. Tách latency do mock/API với thời gian extension; mock nhanh không chứng minh OpenAI nhanh.
- Bài retention: cùng một tập input lặp lại, sau mỗi 10 vòng đóng các pane phụ, đợi idle 10 giây rồi GC bằng CDP ở ranh giới mẫu. Không ép GC trong bài timing; không chụp heap snapshot đồng thời đo latency.
- RSS/Private Bytes của các process browser khác JS heap/cache bytes. Gắn PID với đúng browser QA, đo tuần tự control/candidate, tránh double count shared memory. Nếu không làm được, chỉ báo JS heap/DOM, ghi OS RAM chưa đo.
- Chạy control không extension → extension bật nhưng idle → feature bật trên cùng fixture. Nếu leak chỉ có trên site thật, đối chiếu fixture tĩnh trước khi quy lỗi extension.

Ngưỡng **cảnh báo điều tra**, không phải cam kết performance: sau warm-up và idle/GC, heap cuối tăng >20% và >20MiB so với mốc warm; hoặc nodes/listeners tăng đều qua ≥3 nhóm 10 vòng cùng trạng thái đóng; hoặc p95 phần extension >2 lần nhóm warm. Chạy lại ba lượt, tìm retainer/CPU profile trước khi gọi là leak/regression. Cache hữu hạn có thể tăng rồi ổn định; dữ liệu từ vựng/annotation mới lưu chủ động tăng DB là bình thường. Renderer đứng >30 giây trên fixture nhẹ hoặc request còn chạy sau close là lỗi cần tái hiện ngay.

## 5. Kịch bản thực tế và tiêu chí kiểm tra

Mỗi kịch bản phải có trước/sau, số vòng **thực chạy**, request ledger, console/pageerror và evidence path. Chỉ dùng dữ liệu giả trong các thử nghiệm xóa/clear/import/conflict.

### S00 — Mở extension, để yên, đóng/mở liên tục

1. Profile cold, chưa key: mở Options, popup, PDF Reader, Sổ từ, Audio, Phát âm; chưa chọn dịch/thu/chấm điểm.
2. Mỗi trang đóng/mở 20 lần. Profile warm có config nhưng mọi AI opt-in tắt: để idle 10 phút.
3. PASS: không tự gọi provider, thu mic/tab hoặc phát tiếng; không onboarding loop; mỗi thao tác chỉ mở đúng số trang/host dự kiến. Đóng hết công cụ không để stream/recorder/job sống vô hạn.
4. Onboarding/API-key test do người dùng chủ động bấm là request riêng, không gộp vào idle baseline.

### S01 — Đọc báo HTML, dịch trang rồi trở về bản gốc

1. H1: Translate page, cuộn xuống/lên, bấm link/counter, đổi bilingual/translation-only, restore. Lặp 30 vòng; H2 SPA lặp 20 vòng.
2. Mở khung song ngữ HTML, resize/di chuyển nếu UI hỗ trợ, chọn đoạn, cuộn liên kết rồi đóng/mở. Rerender React và thay route trong lúc đang dịch chậm.
3. PASS: source/link/event handler/input/focus còn đúng; restore không để bản dịch/highlight/host mồ côi; dấu Việt không tách/vỡ/clipped. Pane đọc kết quả engine hiện tại, mở/reopen view không tạo translator thứ hai.
4. So sánh DOM có loại trừ walk labels kỹ thuật được giữ có chủ đích. Không coi mọi attribute thay đổi là lỗi. Đo request cache của page engine riêng, không áp quy tắc cache pane A.9 cho toàn bộ trang.

### S02 — Ca ưu tiên: đọc lại một đoạn, không trả token lần hai

Fixture H1, nguồn EN, target VI, mock completion tức thì, cache rỗng. Đợi trạng thái lưu hoàn tất trước bước tiếp theo.

| Bước                                                           | Lặp   | Delta request mong đợi                       |
| -------------------------------------------------------------- | ----- | -------------------------------------------- |
| Chọn đoạn A → Dịch trong khung cố định                         | 1     | +1 translation                               |
| Bấm lại tab Dịch đang active                                   | 20    | 0                                            |
| Mở Giải thích lần đầu                                          | 1     | +1 explanation                               |
| Quay về Dịch                                                   | 1     | 0                                            |
| Mở Tóm tắt lần đầu                                             | 1     | +1 summary                                   |
| Dịch → Giải thích → Tóm tắt → Dịch                             | 100   | 0 sau ba kết quả đầu đã lưu                  |
| Bôi đen đúng A → dùng toolbar/menu Translate                   | 20    | 0                                            |
| Đóng pane, mở lại A; restart browser cùng profile/ID và dịch A | 5 + 1 | 0 nếu cache/config/key revision vẫn còn khớp |
| Bấm Tạo lại đúng một lần, đợi hoàn tất                         | 1     | +1 translation                               |
| Chuyển mode rồi quay về Dịch                                   | 10    | 0, thấy bản Tạo lại vừa lưu                  |
| Chọn đoạn B chưa dịch                                          | 1     | +1 translation                               |

Trước khi Tạo lại/B mới, tổng success provider phải là **3**, không phải 3 + số click. Không tính request setup/test connection vào ledger này. Nội dung response mock phải phân biệt bản đầu/bản tạo lại, không chỉ đếm.

Thử riêng đổi target/model/custom prompt/glossary có term khớp/key revision/clear cache: cache cũ không được dùng sai; chỉ request explicit mới được đi tiếp. Bản dịch chưa hoàn tất hoặc bị abort không phải cache hit. Cache hết 30 ngày/bị eviction cũng có thể cần dịch lại, không đánh FAIL vì vậy. Muốn thử giới hạn 500 mục/16MiB dùng mock riêng; không nhồi vào phần warm-hit rồi mong mọi mục đều còn.

### S03 — Chọn liên tục khi mạng chậm, kết quả đến ngược thứ tự

1. Mock A 3 giây, B 100ms. Chọn A rồi sau 100ms chọn B; trả A cuối cùng. Lặp 50 cặp với seed cố định.
2. Trong một yêu cầu đang chạy, lần lượt đổi ngôn ngữ, prompt, xóa cache, rotate fake key; hoặc đóng pane/đổi route. Mỗi loại 10 lần.
3. PASS: chỉ B thuộc nguồn hiện tại được hiển thị; A muộn không đè B, không ghi completed cache khi canceled/stale. Không lưu partial thành bản hoàn tất; không tự paid repair/retry.
4. Sau xóa cache/config invalidate, UI không tự làm lại chỉ để lấp chỗ trống; cần thao tác explicit. Request đã gửi trước abort được ghi trung thực, không hứa không mất phí.

### S04 — Hai cửa sổ, nhiều tab, iframe và đổi tài liệu

1. Mở 5 tab HTML + 2 PDF trong 2 cửa sổ QA. Tab A mở fixed pane, dịch A; sang B chọn B; quay A. Lặp 30 vòng.
2. Đổi hash/SPA route, reload giữ cùng URL nhưng document mới, đóng tab A rồi tái sử dụng tab/pane; thử selection từ iframe hợp lệ/khác origin theo quyền hiện có.
3. PASS: pane cập nhật đúng nguồn đã được authorize; route/document cũ không nhận output mới hoặc điều khiển nguồn khác. Trường hợp không được hỗ trợ dùng fallback rõ ràng, không âm thầm mở thêm translator.
4. Highlight nguồn cũ phải dọn đúng; đóng pane thì highlight hết. Toolbar Edge riêng và toolbar extension cùng hiện không tự chứng minh lỗi, nhưng một click extension không tạo hai request.

### S05 — Chụp ảnh/đọc chữ rồi dịch nhiều lần

1. Chụp vùng có chữ Trung → chọn VI; lặp cùng crop 20 lần, rồi đổi crop/ngôn ngữ/mode Fast/two-step. Chèn nội dung riêng ngoài crop.
2. Paste ảnh mới khi ảnh cũ đang xử lý, cancel, force đọc lại/regenerate; mỗi race 10 lần.
3. PASS: tiếng Việt ở kết quả dịch, OCR nguồn vẫn giữ đúng chữ gốc. Đúng cache identity; force-read là explicit bypass. Không dùng ảnh/target cũ, không tự OCR trên open/scroll.
4. Kiểm payload: chỉ ảnh crop được chọn, không toàn screenshot/ngoài vùng, không local path. Không lưu screenshot vào config/PDF history/notebook ZIP. Dữ liệu cache ảnh text/hash có giới hạn.

### S06 — Đọc PDF dài, đóng/mở và nhớ vị trí

1. P1 mở, đến trang 7/zoom/scroll giữa trang → đóng reader → mở lại 20 lần. P4 đổi tên byte giống → mở; file cùng tên byte khác → mở.
2. P3: nhảy đầu/giữa/cuối, cuộn 200 lần, đổi zoom/fit/rotate nếu có trong UI; mở file B trước khi file A khởi tạo xong, 20 vòng.
3. PASS: resume thuộc content hash đúng, vị trí/zoom ổn định; file khác không nhận annotation/cache/vị trí của file cũ. Không có nút Quên vị trí; mặc định luôn nhớ.
4. Đếm reading canvas leases tối đa 3 theo contract, text/OCR cache hữu hạn; không lấy số mọi canvas OCR/export để đánh nhầm giới hạn reading. Open/scroll/view không tự OCR/dịch/upload.

### S07 — Vẽ, ghi chú và ô chữ một phiên dài

1. P1: vẽ ellipse/rectangle/line/arrow; Shift circle/axis/45°; không có tool square mới. Mỗi loại 20 hình, đổi màu/thickness/fill/opacity theo UI.
2. Chọn một/nhiều hình, drag/8-handle resize, copy/paste/duplicate/delete, undo/redo: 50 gesture; thử pointercancel/Esc/đổi file giữa preview.
3. Sticky note: tạo/hover/focus xem nội dung/date, edit/delete/undo; ô chữ Unicode gõ rồi Save/Cancel, đổi file trước khi Save. Reload 10 lần.
4. PASS: pointer preview không ghi DB mỗi mousemove; một gesture hoàn tất tương ứng một revision/history action. Cancel không commit; stale owner không ghi nhầm file. Shape cũ/square legacy vẫn đọc/sửa được.
5. Note có icon, date tạo thật cho note mới, không bịa ngày note legacy; controls không lệch ra ngoài viewport khi zoom. Nội dung decorator/note không chui vào source text để dịch. Không có provider call từ các thao tác này.

### S08 — Tìm kiếm datasheet/RTL nhiều lần và đổi điều kiện nhanh

1. Query lần lượt `abx*xyz`, `clk_en`, `$display`, `a[31:0]`, `8'hFF`, `foo.bar`, đường dẫn có `/`, cụm nhiều từ, tiếng Việt có/không dấu. Fixture có expected match rõ.
2. Đổi các option thực có trong UI: hoa/thường, whole word, dấu/khoảng trắng/wildcard/match mode/range. Gõ nhanh 50 query, đổi range trong lúc search cũ chưa xong.
3. Click ít nhất 20 kết quả rải trang, next/previous, resize/drag panel, đóng/mở 30 lần. Mục lục/page/bookmark cũng resize và keyboard focus.
4. PASS: literal engineering symbols không bị hiểu regex ngoài ý muốn, wildcard theo mode được bật; snippets/trang/counter đúng, chọn result đưa đến đúng trang/vị trí. Search cũ không thay danh sách query mới.
5. Range sai báo rõ; scan chưa OCR không tự gọi OpenAI/OCR. Không có document-category presets. Search/view/bookmark không gọi provider; DOM list có giới hạn với hàng nghìn hits.

### S09 — Song ngữ PDF: sửa cấu trúc rồi dịch

1. P1 bật song ngữ theo đoạn; đối chiếu heading, bullet hanging-indent, bảng/cell/code với nguồn. Chọn Ctrl nhiều đoạn 08/09/10/11, gộp/tách/exclude/reset rồi undo/redo; 30 vòng.
2. Dịch một đoạn, dịch lại khi đã lưu; chọn explicit range 2–4, đổi target rồi cancel; đang stream thì gộp/xóa đoạn nguồn hoặc đổi file.
3. PASS: giữ cấu trúc hàng/ô; membership edit hủy translation/restore cũ, output muộn không gắn vào nhóm mới. Excluded text không lọt cache lookup/provider. Editing không tự dịch hay gọi paid repair.
4. Đổi file rồi mở lại phải giữ sửa cấu trúc đúng source fingerprint. Linked scroll không giật vòng lặp; view/cache-only không âm thầm gọi provider trên miss. Đo request với identity thực tế, không suy từ badge UI.

### S10 — OCR theo dải trang, dừng giữa chừng

1. P2: local OCR trang 1 → 2–5 → 6–10; search/chọn text sau OCR. Từng lần phải do user bấm. Với dải dài, đổi page/file/cancel/close ở giữa, 10 vòng.
2. Mock riêng OpenAI crop OCR: chọn một vùng, yêu cầu OCR/translate; so payload vùng đúng. Không chạy OpenAI fallback khi local OCR lỗi.
3. PASS: local OCR chạy khi DNS ngoài bị chặn; selectable normalized geometry gắn đúng trang, một OCR worker có giới hạn cho dải explicit; không batch mọi trang khi scroll/open.
4. OCR geometry LRU6/key inventory và ownership theo tài liệu được giữ; job cũ không hiện trên file B. Range out-of-bounds/blank/invalid không khiến vòng lặp vô hạn. Original PDF binary không xuất hiện trong request.

### S11 — In, trích trang, bookmark và PDF gốc

1. P1 đánh dấu trang tên/màu/offset/zoom; quay lại 20 lần. Extract các range có overlap `1-10,3-5`, thứ tự trộn và input sai; kiểm output theo semantics ordered dedup hiện tại, không tự sort khác contract.
2. Print local; annotated export khi explicit được bấm; undo thay đổi rồi export lại. Cancel file-picker/print/extract, đổi file giữa job.
3. PASS: SHA-256 PDF gốc không đổi; số trang/thứ tự PDF mới đúng, Unicode/ink/note export đúng khả năng được công bố. Nếu không kiểm được print dialog/output, ghi phần đó NOT_RUN.
4. Không provider upload khi print/export/extract/bookmark; không gắn job kết thúc vào document khác. Mở lại file mới phải là identity mới phù hợp nội dung.

### S12 — Xem YouTube có CC, bật/tắt phụ đề và Learning

1. V1 xem 20–30 phút tổng thời gian QA, toggle phụ đề 30 lần, seek tới/lùi 30 lần, đổi tốc độ/track/target/video/ad fixture.
2. Bật Learning, resize/drag/fullscreen/đổi viewport, mở/đóng 20 lần. Opt-in luyện nghe từng câu rồi tắt trong lúc segmentation đang chạy.
3. PASS: subtitle thường dùng buffer dịch trước 2 phút tại 1× theo contract hiện tại, không dịch toàn video chỉ vì mở menu. Thay đổi nguồn/CC/ad hủy đúng công việc cũ.
4. Sentence regroup chỉ chạy khi opt-in; index-only boundary hợp lệ, không bịa câu/timing chính xác nếu dùng interpolation. Chế độ thường độc lập. Drag Learning không remount transcript hay tự gọi AI. Đổi video không còn CC/output cũ.

### S13 — Lồng tiếng, đổi âm lượng/offset khi đang nghe

1. V1 có CC, bật đọc lời gốc rồi lời dịch. Mỗi mode start/stop 20 lần; pause/resume/seek giữa câu, đổi video/tab, cuối video, TTS pending.
2. Trong playback chỉnh source/dub volume, offset âm/dương nhiều lần (50 thay đổi), bấm pause thủ công lúc extension đang buffer.
3. PASS: không hai giọng TTS phát trùng cho cùng cue, không phát lại câu cuối; không tự resume sau user pause. Mix/offset không tạo lại TTS/provider chỉ để áp slider.
4. Âm gốc default 5% là gain giảm tương đối với mức user, giữ thấp đến hết max(CC end,TTS completion), khoảng nối/release theo contract; không vọt tiếng giữa câu. Stop/cancel restore chỉ khi còn sở hữu volume/mute, không đè chỉnh tay của user.
5. Kiểm giới hạn cửa sổ 30 giây/6 cues, 2 synthesis jobs, completed audio tối đa 6/16MiB theo [VIDEO_DUBBING.md](VIDEO_DUBBING.md); controls view không gọi thêm analysis. Nghe thực tế nếu công cụ có audio; waveform/mock scheduling chỉ là bằng chứng cơ chế, không chứng minh giọng nghe mượt.

### S14 — Phân tích thông minh trước/khi xem

1. V2: master OFF → mở menu/đổi duration, phải không có provider. Bật passive 15s rồi 30s; thử 1/2/5/10 phút bằng fixture/mock thời gian phù hợp. Ghi rõ lựa chọn nào thực sự đã chạy đủ duration.
2. Đang lấy mẫu đổi duration/tắt/seek/rate/ad/video; prepared mode từ giữa video dài, cancel hoặc user pause trước khi kết thúc. Mỗi race 10 lần.
3. PASS: duration change tắt AI/chờ bật lại; passive không seek/pause/rate/microphone, chỉ audio thực đã phát, pause/buffer không tính nhầm; một paid attempt/part 10 phút, không retry lỗi tự động. Không áp part-dedup của passive cho nút prepared explicit.
4. Prepared ghi đúng khoảng từ vị trí hiện tại, restore owned position/rate paused. File toàn video ≤10 phút/8MiB là đường riêng; không tải audio remote để né capture.
5. Speaker mapping chỉ câu thực đã nghe/native index hợp lệ; người chưa rõ dùng voice baseline, không suy giới tính/danh tính chắc chắn từ fixture oscillator. Profile/context RAM/source-scoped, refresh không hủy controller gây lặp tiếng. Chất lượng lời dịch/speaker thật cần live sample đã được cho phép riêng.

### S15 — ani.pm, X/Twitter, Netflix và CC thiếu

1. ani.pm: SOFT English native track hoạt động; HARD burned-in hoặc không CC; thay episode/server do thao tác test explicit. Bật/tắt 20 lần.
2. Nhập ngữ cảnh anime → Apply → sửa khi đang dịch → sang anime khác. Đóng/reopen tab để kiểm context RAM không sync/lưu nhầm.
3. X/Netflix có native CC: play/seek/track/SPA/fullscreen/đóng extension; Netflix track restoration sau stop. Test site thật cần account/quyền và capture hợp lệ.
4. PASS: thiếu CC có hướng dẫn phù hợp, không tự bật track disabled, đổi server, OCR/ASR trả phí hoặc bypass DRM. Menu auto-hide như player hỗ trợ; icon không duplicate sau SPA. Không giữ context phim A sang nguồn B. Site không truy cập được là BLOCKED, không PASS nhờ fixture.

### S16 — Chép lời trực tiếp khi vẫn dùng máy tính

1. Audio page lấy tab QA có A1; live start → source pane pin, chuyển sang tab công việc/click/gõ/scroll; im lặng 2 phút rồi có tiếng trở lại.
2. Toggle dịch theo ngữ cảnh/đổi target 20 lần; mock final/partial/out-of-order/duplicate turn IDs. Kiểm source pane bằng fake Facebook/Teams-like SPA rerender/removal.
3. Close/reopen pane view 20 lần, thu nhỏ/PiP nếu có; recovery injection chậm/thất bại; đổi route/tab document trong lúc capture. Đóng Audio owner; lặp 10 phiên đầy đủ.
4. PASS: im lặng không làm pane pinned biến mất; đóng view/PiP không tự dừng capture, đóng Audio owner phải cleanup. Reopen view dùng cùng stream/WebRTC/owner, không tạo session/secret/offer/provider thứ hai.
5. Partial không bị dịch liên tục; final-only contextual translation tối đa 2 jobs, bỏ obsolete mà không retry, target/route/config/key đổi thì không đè output. Giữ 500ms voiced-silence gate và cap audio-clock 6s, kể cả source pane không có.
6. Không mic ngoài chủ ý; phiên hết còn trạng thái dừng rõ, không thu ngầm. Chuyển route xóa text/translation của nguồn cũ. Mock request ledger kiểm cả WebRTC session creation; latency live thật cần đo riêng.

### S17 — Upload MP3 nhiều file và xuất SRT

1. Audio page chọn EN/zh/ja/vi hoặc multilingual; upload A1 rồi 10 file kế tiếp, cancel file A khi đang xử lý B. Thử file rỗng/sai MIME/oversize theo giới hạn UI/runtime hiện tại.
2. Chọn output text rồi timed subtitles, explicit transcribe; edit plaintext, export TXT/SRT, restore text; 10 vòng.
3. PASS: không auto-upload chỉ vì chọn file/đổi option. Transcript thuộc đúng file/target; SRT dùng segment timestamps hợp lệ, không bịa timecode từ chiều dài chữ. Plaintext edit vô hiệu SRT đến khi restore đúng; invalid timestamps báo rõ, không paid repair.
4. File/audio/text không đi config sync hay được giữ vĩnh viễn ngoài đường lưu explicit. Lỗi/close cleanup, không phải restart browser mới hết busy.

### S18 — Nghe TTS, tải MP3 và lưu thư viện cùng lúc

1. Đoạn A → loa → download MP3 explicit, chuyển A/B 30 lần. Trong lúc export đang chạy bấm stop playback, rồi lưu từ vựng/reading library.
2. Download toàn đoạn dài, đổi key/model/speed/voice trong job; cancel file-save. Đối chiếu duration/decoding với ffprobe, không chỉ file tồn tại.
3. PASS: playback/export/vocabulary có cancellation độc lập; không auto-download khi nghe; cache audio chỉ reuse khi identity đúng. MP3 liên tục toàn đoạn, không chỉ chunk đầu/byte nối hỏng. Tên file/payload không lộ source path/key.

### S19 — Sổ 1.000 từ, ôn lâu rồi export logs cho ChatGPT

1. Import N1 vào HTML riêng; tạo Sổ 1/2/3 có tên, chuyển sổ 30 lần. Reload cùng URL/profile không bắt import lại.
2. Ôn 100 lượt gồm typing sai/đúng, hint, correction, dictation, cloze, flashcard tự đánh giá; nghỉ/reload/resume lesson giữa chừng. Cố ý double-click/check/Enter/repeat.
3. Export ZIP + report compact + full logs, import lại 3 lần; thử legacy ZIP, corrupt/oversized/archive path nếu có validator. Chỉ dùng notebook QA cho clear/delete.
4. PASS: lần trả lời đầu còn nguyên, hint/correction không thành unassisted đúng, flashcard không thành bằng chứng thuộc từ. SRS ≤1 cập nhật/từ/run; stable event ID không nhân đôi sau import; encounter/source passage không tăng answer count.
5. Report per-word có số đúng/sai/assisted/chưa kiểm tra và dữ liệu đủ tư vấn, không bịa log cũ. Notebook/audio/progress độc lập và không vào config sync. Test 390px/phone emulation; ghi physical phone NOT_RUN nếu không có thiết bị.
6. Mở HTML từ file URL và HTTP(S) là hai origin/storage có thể khác: không kết luận mất dữ liệu vì đổi origin/đường dẫn. ZIP vẫn phải portable import được; audio không cần key để nghe phần đã lưu.

### S20 — Phát âm một từ và một câu, thu lại nhiều lần

1. Selection/dictionary tiếng Anh → Phát âm, một từ 20 attempts + câu 10 attempts; VI/zh/ja không tự hiện action English-only.
2. Auto stop: im lặng ngay đầu, nói rồi im, noise ngắn, từ chối mic, nói dài, bấm manual stop, đóng trang lúc request pending.
3. Chỉ bấm Grade mới upload; retry cùng recording vs recording mới; mock feedback valid/low-confidence/schema sai/401/timeout.
4. PASS: không tự chấm/upload chỉ vì auto-stop; từ đơn không bị bắt buộc rhythm/fluency, điểm 0–10 bước 0,5, uncertain không bịa điểm, không paid repair. Cùng recording cached không nhân đôi attempts; local shadowing không upload/không ghi thành đáp án từ vựng. Mic/analyser/timer cleanup đúng.

### S21 — Cấu hình, credentials, backup và gỡ đồng bộ tài khoản

1. Save/replace/delete fake key, Test connection explicit; export/import settings; 20 lần đổi setting từ hai trang Options.
2. Chạy `check-settings-sync-removal.mjs` với ZIP A.18 thật: cùng thư mục/cùng ID, giữ config/key/sổ từ/backup, seed alarm và state sync cũ enabled=true.
3. PASS: alarm cũ bị clear, RPC sync không còn; popup/options không còn nút đồng bộ. URL cũ chỉ có HTML tĩnh, không script hay thao tác kho sync. Các file/chunk cũ được giữ trên đĩa theo quy trình copy-only nhưng không được trang cũ tải lại.
4. `storage.sync` được instrument sau bootstrap: không app call khi xem/sửa/export/import. Dữ liệu sync cũ được test fixture kiểm nguyên vẹn; không xóa cloud data, không đăng nhập tài khoản thật. Không coi đây là test Microsoft cloud delivery.
5. Giữ import/export file, backup local, secret exclusion và frozen migrations; khôi phục cấu hình không làm mất key/sổ từ. Không khôi phục transport từ upstream.

### S22 — Privacy/network audit xuyên suốt mọi kịch bản

1. Gắn capture metadata từ source, service worker, offscreen/extension pages, file/audio ports và peer session. Đánh dấu feature/request reason; đối chiếu provider counter với UI.
2. PDF fixture có canary riêng trong byte không được chọn; ngoài crop có canary khác. Assert canary không lọt egress; kiểm payload type/body không có PDF header/binary/base64 cả tài liệu. Canary test không thay cho audit đầy đủ mọi đường upload.
3. PASS: xử lý nội dung chỉ fixed OpenAI endpoints; local PDF không upload, chỉ selected text/crop explicit đi đúng boundary. Không Microsoft TTS/telemetry/Iconify/rules updater/hosted translator trong production.
4. Phân loại riêng native watched-site caption GET, explicit PDF-source GET, browser sync opt-in và request của chính site. Không kết luận mọi network của trang đều do extension, cũng không bỏ qua provider request vì đến từ offscreen.
5. Logs/HAR phải redact Authorization/cookies/secret/session tokens; không ghi audio/raw meeting text/key. Static audit tốt nhưng không đủ để tuyên bố runtime privacy PASS.

### S23 — Lỗi mạng và vòng đời MV3

1. Mỗi task translation/TTS/OCR/ASR/analysis: inject offline/401/429/500/timeout/truncated/empty/malformed và kết quả sau abort, 5 lần/loại bằng mock.
2. Suspend/restart worker thử nghiệm ở ranh giới hợp lệ, close tab/pane/tool giữa job, sleep/resume mô phỏng; UI không giữ spinner vô hạn.
3. PASS: lỗi hiểu được, job cleanup và explicit retry hoạt động; không sửa output sai thành cache complete, không paid retry/repair ngầm hay request storm. Request nào có retry transport theo cơ chế đã công bố phải đếm và giải thích chính xác, không chỉ nhìn một toast.
4. Worker chưa online/port disconnect không được làm secret lộ ra public channel. Sau resume không phát audio cũ hoặc tự thu/chấm lại. Nếu công cụ không mô phỏng OS sleep thật, ghi rõ chỉ test route/port lifecycle.

### S24 — Cập nhật mà vẫn giữ dữ liệu, chỉ trên cài đặt QA

1. Trong **profile QA bền vững**, load baseline thật, tạo note/bookmark/vocab/history/config và fake credential. Ghi digest/inventory cần bảo toàn.
2. Đóng job đang chạy, thay code tại cùng thư mục unpacked QA theo manifest-last, giữ key/ID, reload cùng entry; mở lại dữ liệu. Lặp update/restart 5 lần nếu baseline hợp lệ còn đọc được.
3. PASS: không mất/nhân đôi notebook/events/annotations/settings; key vẫn private, old shapes/legacy formats đọc được. Không remove/reinstall, không mirror-clean hoặc reset DB để làm migration xanh.
4. Không chạy bài này trên `C:\Users\TIEN\Downloads\ReadFrog-Edge-1.58.0A` của người dùng. Nếu sau QA được yêu cầu build ZIP mới, áp dụng nguyên workflow AGENTS stage/copy/hashes vào path ấy; đó là công việc phát hành riêng, không bước mặc định của test.

## 6. Phiên dùng hỗn hợp liên tục 120 phút

Chỉ mock provider, cùng browser/profile; thao tác qua UI/message thật. Nếu không đủ thời gian, ghi số phút thực chạy và phần NOT_RUN, không đổi nhãn thành “đã test 2 giờ”.

| Phút    | Hành trình                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------- |
| 0–10    | Warm-up/metrics; đọc H1, dịch trang/restore, fixed pane A/B, thử cache S02                      |
| 10–30   | 10 vòng: HTML dịch/chọn từ → PDF search/bookmark/annotation → quay HTML pane                    |
| 30–50   | YouTube CC/dubbing/learning, seek/pause/volume; đổi sang ani.pm fixture và context              |
| 50–70   | Live ASR chạy trong nền, pane pin; dùng PDF/HTML ở tab khác, chèn 2 phút im lặng, hồi phục view |
| 70–90   | OCR explicit dải trang + song ngữ merge/exclude/cancel; TTS/MP3/library; review sổ              |
| 90–105  | Rapid selection/config/route races, offline/timeout, hai cửa sổ chuyển nguồn                    |
| 105–115 | Đóng mọi AI/capture/pane phụ; idle 10 phút, đo cleanup/retention/cache plateau                  |
| 115–120 | Đóng rồi mở lại cùng profile, kiểm resume/logs/notebook/cache; export report                    |

Đừng “replay” time bằng fake clock rồi nói đã soak 120 phút thật. Có thể dùng fake timers cho unit race/TTL; ghi loại test riêng. Chạy lại soak sau khi sửa lỗi bằng cùng seed/workload. Cache pressure và cold-run là lượt riêng để không phá điều kiện warm-hit.

## 7. Nhánh OpenAI thật — tùy chọn, không mặc định

Chỉ khi chủ dự án đã cấp key QA/quyền dùng và ngân sách cụ thể. Không suy “tốn token cũng được” ở tính năng cũ thành ngân sách vô hạn cho hàng nghìn lần test. Mặc định live budget = 0.

- Chọn mẫu nhỏ: một đoạn HTML EN→VI, một crop Trung→VI, một TTS, một phân tích audio hai người nói, một live ASR ngắn, một từ/câu pronunciation. Ghi model thực UI/request, duration/tokens/actual usage; không tự đổi model cho rẻ hoặc sửa price table.
- Chặn vòng lặp live, có trần request/duration và stop khi tới ngân sách/429/lỗi. Không tự retry model/schema/quality cho đến khi “trông đẹp”.
- Đánh giá thủ công bám transcript chuẩn: dịch đúng ngôn ngữ/thuật ngữ/cấu trúc, speaker turn đúng, timing và lời đọc. Nêu sai sót cụ thể; mock không đánh giá được các mặt này.
- WebRTC/mixed audio usage thiếu giá modality thì cost unknown; không lấy số request × giá text để bịa tiền. Không ghi key/SDP/token/raw audio trong báo cáo chia sẻ.

## 8. Báo cáo Gemini phải giao lại

Lưu trong thư mục QA, ví dụ:

```text
.codex/qa-flowread-<timestamp>/
  REPORT.md
  run-manifest.json
  cases.jsonl
  metrics.jsonl
  provider-counts.jsonl
  bugs/
    BUG-001.md
  evidence/
    console-redacted.log
    before.png
    after.png
  harness/
```

`run-manifest.json`: commit/dirty diff hash, manifest version, build hash, OS/browser/Node/pnpm, profile cold/warm (không public full private path), feature/config identity không key, mock/live, seed, start/end, tooling limitations. Screenshot phải raw; crop/composite chỉ phụ trợ có nhãn.

Một record `cases.jsonl`:

```json
{
  "scenario": "S02",
  "status": "PASS",
  "cyclesPlanned": 100,
  "cyclesRun": 100,
  "providerMode": "mock",
  "translationRequests": 1,
  "explanationRequests": 1,
  "summaryRequests": 1,
  "unexpectedRequests": 0,
  "evidence": ["evidence/cache-counts.json"],
  "notes": "warm complete results; no regenerate/eviction in this phase"
}
```

Đó là **ví dụ format**, không copy thành kết quả khi chưa chạy. Case không thử phải xuất record NOT_RUN/BLOCKED, không bỏ khỏi denominator. Ghi automated assertions và human-only checks riêng.

Mẫu `REPORT.md`:

1. **Kết luận ngắn:** có lỗi chặn hay không; số PASS/FAIL/BLOCKED/NOT_RUN; tổng phút soak thực.
2. **Đã sửa:** trong QA mặc định ghi “không sửa production”; nếu có bản fix được duyệt riêng, ghi commit/diff và xác nhận lại.
3. **Đã kiểm thử:** từng scenario, số vòng, cold/warm/mock/live, request ledger, p50/p95/max và sample count, memory trước/sau/nguồn đo.
4. **Chưa kiểm thử:** site live/account, OS menu, physical phone, real quality/cost, cloud delivery, duration dài chưa chạy đủ.
5. **Bị chặn:** thiếu tool/artifact/Edge launch/account/quyền, log và cách gỡ chặn; không đổi BLOCKED thành FAIL sản phẩm.
6. **Lỗi ưu tiên:** P0 dữ liệu/secret/private upload; P1 paid duplicate/stale cross-tab/stream không dừng/crash; P2 chức năng/hiệu suất tái hiện; P3 polish. Mỗi bug có expected/actual, seed/input, 3–7 bước tối thiểu, tần suất n/N, thời điểm, requests, raw evidence.
7. **Đề xuất:** fix nào trước, tác động, test hồi quy cần thêm; không đề xuất rewrite toàn bộ khi chỉ có giả thuyết.

Không kết luận “không có lỗi” chỉ vì unit pass. Kết luận đúng là: “Không phát hiện lỗi trong các kịch bản/điều kiện đã chạy”, kèm giới hạn cụ thể. Các bài S02/S03/S04/S09/S13/S16/S19/S22 chưa chạy đầy đủ thì phải nói rõ trước khi đề nghị phát hành.

## 9. Tài liệu hành vi để đối chiếu khi viết assertion

- HTML: [cache A.9](HTML_SELECTION_CACHE_A9.md), [fixed pane A.8](HTML_FIXED_PANE_AUDIO_A8.md), [HTML bilingual](HTML_BILINGUAL_READING.md).
- PDF: [reader tools](PDF_READER_TOOLS.md), [workspace](PDF_WORKSPACE_1_59_1A6.md), [reader ranges/search/print](PDF_READER_1_59_1A7.md), [annotation UX](PDF_ANNOTATION_UX_A9.md), [bilingual](PDF_BILINGUAL_READING.md), [performance](PDF_PERFORMANCE_1_59_1.md).
- Video/audio: [dubbing](VIDEO_DUBBING.md), [audio transcription](AUDIO_TRANSCRIPTION.md), [ani.pm](ANI_PM_SUBTITLES.md), [X/Netflix](X_NETFLIX_SUBTITLES.md), [listening/usage](STUDY_FLOW_AND_USAGE.md).
- Learning/data: [vocabulary](VOCABULARY_LEARNING.md), [reading lab](READING_LAB.md), [pronunciation](AMERICAN_PRONUNCIATION.md), [MP3 export](OPENAI_TTS_DOWNLOAD.md), [gỡ đồng bộ A.19](EDGE_SYNC_REMOVAL_A19.md), [privacy](PRIVACY_POLICY.md).
- Automation: [.agents/skills/extension-puppeteer-debugging/SKILL.md](.agents/skills/extension-puppeteer-debugging/SKILL.md), [performance attribution](.agents/skills/extension-perf-forensics/SKILL.md). Ví dụ upstream dùng free/Microsoft translator không áp dụng cho fork OpenAI-only; test phải giữ mock/private endpoints hiện tại.
