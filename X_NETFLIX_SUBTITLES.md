# X/Twitter và Netflix trên bản local 1.58.0A

## Nguồn và phạm vi

Ngày 06/11/2026, đã kiểm tra GitHub Releases API: bản phát hành mới nhất của
`mengxi-ream/read-frog` vẫn là [v1.58.0](https://github.com/mengxi-ream/read-frog/releases/tag/v1.58.0),
tag trỏ đúng commit `48dccd04cfdf8432994608215ccad6db329f952b`.
HEAD local trước thay đổi là `c1ef4a2877248bac2c5af59fc5442aa011a9ac1f`.

Khôi phục 17 file adapter/fetcher/bridge/test đã bị fork bỏ khỏi tag này, cùng
đăng ký runtime, content-script matches, export fetcher và UI auto-start.
Không lấy `main` đang phát triển làm baseline. Nhánh: `codex/x-netflix-subtitles`.

- **X/Twitter:** dùng DOM ownership và logo/menu của upstream; đọc native
  TextTrack và loại track render từng phần có label `clone`. Hỗ trợ post, reply,
  timeline và các host X/Twitter mà upstream đăng ký. Video cần track text sẵn.
- **Netflix:** dùng interceptor MAIN-world từ `document_start`, nhận diện
  manifest và quan sát response TTML do chính player tải. Chọn track text
  phù hợp với audio như upstream nếu CC đang Off; đổi track/episode làm mới dữ
  liệu. Khi tắt, khôi phục track cũ nếu người xem chưa tự đổi sang track khác.
- **Dịch:** tiếp tục qua OpenAI chính thức với private credential hiện có,
  cache/batch/streaming và bộ đệm 120 giây ở 1×. Không khôi phục provider khác,
  Read Frog account/server, telemetry hoặc dịch vụ tạo phụ đề hosted.

Chỉnh khác upstream có chủ đích: khi player biến mất dùng `notifyLeave()` để
dừng công việc thay vì khởi tạo lại trên một trang không có video; khi context
invalidated phải destroy adapter, tháo logo/overlay/sidebar, dừng observer/timer
và bỏ shortcut đang chờ. Giữ guard hostname của YouTube đã sửa ở build trước.

## Sử dụng

Giải nén ZIP đè đúng thư mục extension cũ, Reload tại `edge://extensions`, rồi
refresh trang video. Popup bản này là `1.58.0-a.3`; manifest `1.58.0.4`, tên
hiển thị `1.58.0A`. Bấm logo Read Frog trong controls để bật dịch. Chọn ngôn ngữ
đích và API key như các tính năng dịch hiện có.

Video Subtitles → Translate on open hiện lại hai switch **X** và **Netflix**.
Giữ các lựa chọn đã lưu; mặc định hai switch vẫn tắt. Các field/schema đã tồn tại
từ trước, nên **không cần migration mới** và không sửa migration đã phát hành.
Schema vẫn **124**, không thay credential DB hoặc đưa key vào backup/export.

## Những phần phải giữ khi nâng cấp

- Runtime cùng các `matches` phải chứa X, Twitter và Netflix; chỉ hiện switch
  mà thiếu entrypoint/bridge sẽ không hoạt động.
- Netflix cần cả `netflix-interceptor.content/`, `NetflixSubtitlesFetcher`,
  TTML parser, platform config và translate button. TTML dùng tick timing của
  Netflix, không phải chuỗi timestamp SRT. Không thay parser theo fixture sai.
- Netflix quan sát URL TTML theo whitelist hiện có; không thêm background proxy
  lấy URL bất kỳ, không đưa OpenAI Authorization vào request caption, không lưu
  signed CDN URL trong config/export/tài liệu hoặc fixture đã commit.
- Giữ phân biệt `movieId` + `trackId`, đọc state khi poll và không tải lại liên
  tục cùng một track lỗi. Image-based/forced/None track không phải text CC dùng
  để dịch. Không tuyên bố OCR hoặc vượt bảo vệ nội dung.
- X cần ownership của đúng video/article, DOM stamps và khôi phục mode track
  khi tắt. Không dùng track `clone` làm transcript. Không bỏ các sửa identity
  TextTrack đã có của fork để quay lại cache chỉ dựa trên label/ngôn ngữ.
- Ani.pm vẫn dùng policy thụ động riêng, không sửa mode track của Settlar và
  tự đóng menu khi bật. Đừng áp policy Netflix/X lên ani.pm.
- Giữ PDF, Microsoft/OpenAI TTS, font tiếng Việt và UI YouTube gốc. Xem
  [UPSTREAM_UPGRADE_GUIDE.md](UPSTREAM_UPGRADE_GUIDE.md).

## Tạo phụ đề khi thiếu CC bằng OpenAI

**Có thể làm**, nhưng chưa nằm trong bản khôi phục native caption này. Theo
[OpenAI Docs về file transcription](https://developers.openai.com/api/docs/guides/speech-to-text)
và [Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription),
OpenAI nhận âm thanh để tạo transcript. Luồng cần bổ sung là lấy âm thanh →
nhận dạng giọng nói → gắn thời gian theo video → dịch → renderer phụ đề hiện có.

File âm thanh có sẵn có thể được xử lý trước; nếu chỉ thu âm thanh đang phát,
không thể nhận dạng phần chưa phát để dịch trước hai phút. Cần xử lý seek,
playback rate, pause, cancellation và cache. Realtime transcription không tự
cung cấp word-level timestamps, nên phải thiết kế đồng bộ thời gian phù hợp.
Khả năng lấy âm thanh trên Netflix/player có bảo vệ cần khảo sát riêng.

Khi triển khai, kiểm tra lại model/endpoint hiện hành trên OpenAI Docs, giữ key
trong background, thêm thao tác bật thu âm rõ ràng và không tự chuyển sang ASR
khi một video không có CC. Nhận dạng âm thanh là phần API bổ sung có chi phí.
Không thêm quyền thu âm/tab capture hoặc endpoint ASR vào bản ZIP hiện tại.

## Kiểm chứng

Các test fetcher/Netflix bridge/track poll và X video URL được khôi phục từ tag
gốc. Browser harness dùng Edge production build, profile riêng, player/TTML/
TextTrack mô phỏng và OpenAI Responses mock. Có kiểm tra MAIN-world bridge
Netflix thực sự, lựa chọn/khôi phục track, không gửi key vào request caption,
dịch qua runtime production, menu/logo, leave cleanup, trạng thái auto-start
X/Twitter khi thiếu CC và đổi episode Netflix.

**Chưa kiểm thử:** tài khoản X/Netflix đăng nhập thật, mọi dạng video/tài khoản/
khu vực, OpenAI API live hoặc Firefox. Không đọc profile, cookie hay API key
thật của người dùng. Không coi fixture là bằng chứng đã xem Netflix live.

## Kết quả bản 1.58.0.4

**Đã sửa:** khôi phục đầy đủ native caption X/Twitter và Netflix theo tag gốc,
cùng UI auto-start và lifecycle cleanup phù hợp runtime fork. 15 trong 17 file
khôi phục có nội dung giống hệt tag; hai initializer được bổ sung cleanup và
`notifyLeave`. Không đổi schema 124, credential storage hoặc bộ đệm hai phút.

**Đã kiểm thử:**

- **3.948 test đạt, 1 test bị gate bỏ qua**, trên 389 file test. Đặt
  `SKIP_FREE_API=true`, loại free-api live có chủ đích theo AGENTS.md.
  Lint/type-check, format và build ZIP Edge đạt.
- **24 assertion Edge đạt** trên fixture: logo/menu gốc, X dịch track đầy đủ
  thay vì `clone`, khôi phục mode, Twitter alias và auto-start OFF khi không có
  CC; Netflix đi qua MAIN-world JSON/XHR capture thực sự, dịch TTML, đổi track,
  khôi phục Off, tôn trọng track do người xem tự chọn, đổi tập và leave cleanup.
  Request caption không mang key OpenAI; public config không chứa key giả.
- Chạy lại smoke YouTube +120 giây, Bilibili/Udemy/Business/edX, ani.pm live
  (OpenAI mock), OpenAI TTS, PDF native qua production menu handler với sự kiện
  mô phỏng, font tiếng Việt và popup web ghim. Tất cả đạt.
- Cập nhật ZIP tại chỗ trong profile test giữ nguyên ID/key giả/model/ngôn ngữ,
  cấu hình hai TTS và cả lựa chọn `autoStart.xcom = true` đã lưu trước đó;
  `netflix = false` và schema 124 được giữ đúng. Không dùng profile/key thật.

**Chưa kiểm thử:** X/Netflix đăng nhập thật và OpenAI API live; các giới hạn đã
ghi ở trên vẫn áp dụng. Speech-to-Text khi thiếu CC chưa được triển khai trong
bản ZIP này; phần trên là đánh giá khả năng theo OpenAI Docs.

**Bị chặn:** không có blocker triển khai hoặc đóng gói ZIP.

**ZIP:** `ReadFrog-Edge-1.58.0A-X-Netflix.zip`, 196 file, 5.928.265 byte;
manifest `1.58.0.4` / `1.58.0A`, popup `1.58.0-a.3`. Đã kiểm tra MAIN-world
entrypoint Netflix ở `document_start`, matches X, file tham chiếu manifest,
không production key, profile, test key, `.env`, `.pem` hoặc CRX trong gói.
SHA-256: `AEA57168C846556E91B5A8BA795D78B39DB91462F2E33AAD8E42CCF169432C79`.
