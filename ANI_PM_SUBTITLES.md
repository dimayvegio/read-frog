# Phụ đề ani.pm trong bản local 1.58.0A

## Phạm vi và cách dùng

1. Cập nhật extension trong cùng thư mục đang dùng, rồi bấm **Reload** tại
   `edge://extensions`. Refresh tab ani.pm để nạp content script mới.
2. Mở tập phim, bật CC của player và chọn một track phụ đề text có sẵn, ví dụ
   **English CC (Dub)** hoặc **English**. Đợi phụ đề gốc xuất hiện.
3. Bấm logo Read Frog ngay trước nút CC, bật **Read Frog Video Subtitles**.
   Menu tự đóng sau khi bật để không che video. Bấm logo lại để dùng menu kiểu
   chữ, song ngữ/chỉ bản dịch, vị trí, tải phụ đề và Learning hiện có của YouTube.
   Kéo phụ đề để đổi vị trí như trước.
4. Khi tắt dịch, phụ đề gốc hiện lại. Có thể bật tự dịch riêng cho **ani.pm**
   trong Video Subtitles → Translate on open; mặc định tắt.

Cần OpenAI key đã lưu trên thiết bị và model đang hoạt động. Bộ đệm chung
vẫn dịch trước **120 giây ở tốc độ 1×**, theo tốc độ phát, tối đa hệ số 4.

Chỉ hỗ trợ player Settlar được quan sát bên dưới, với track text đã được
player tải. Không OCR phụ đề cháy vào hình, không nhận dạng giọng nói và
không tự tải track đang bị tắt. Nếu báo không có phụ đề, bật CC/chọn track
trong player trước rồi bật dịch lại. Player/server khác cần khảo sát riêng.

ani.pm có thể chèn quảng cáo trong suốt che player và chặn cả nút CC lẫn
logo. Extension không can thiệp quảng cáo. Khi kiểm chứng bằng profile Edge
riêng, chỉ script quảng cáo quan sát được `acscdn.com/script/aclib.js` bị chặn
trong harness; trang, iframe, video và phụ đề vẫn tải từ site thật.

## Khảo sát thực tế ngày 06/11/2026

Trang thử: One Piece, episode 1, đường dẫn công khai
`https://ani.pm/anime/one-piece-1642-hmpadj`. Không lưu query episode, token,
cookie, manifest video hoặc nguyên tập phụ đề vào repo.

| Mục                | Bằng chứng đã quan sát                                                         |
| ------------------ | ------------------------------------------------------------------------------ |
| Frame sở hữu video | `https://embed.settlar.io/embed/v1`, được nhúng trực tiếp bởi `https://ani.pm` |
| Frame ancestry     | `location.ancestorOrigins` chỉ có `https://ani.pm`; referrer chỉ có origin     |
| Player/video       | `.settlar-player video`; `currentSrc` là blob, video chạy được                 |
| Controls/CC        | `.media-controls`, `.media-overflow`, `.media-button--captions`                |
| Hiện/ẩn controls   | `data-visible`, `data-interactive`                                             |
| Track đã tải       | kind `subtitles`, `en`, `English CC (Dub)`, mode `showing`, 168 cue            |
| Timing mẫu         | Cue đầu 1,137 → 3,097 giây; chuyển sang 1137 → 3097 ms                         |
| Track chưa tải     | `English`, `English [SubSource]` đang disabled, không có cue để đọc            |
| Lớp chữ gốc        | `.vjs-own-caps__win > .vjs-own-caps__text`                                     |
| Fullscreen         | Player yêu cầu trang cha fullscreen vùng chứa iframe                           |

Không cần MAIN-world bridge, interceptor caption, background fetch mới hoặc
proxy. Chỉ đọc `video.textTracks` trong isolated content script của đúng frame.

Đã quan sát đổi tập 1 → 2: iframe được giữ nhưng nguồn video thay, episode 2
có 252 cue. Extension reset về OFF theo cấu hình và không giữ bản dịch tập cũ.

## Các ràng buộc phải giữ khi nâng cấp

- `isAniPmPlayerFrame` kiểm tra exact HTTPS origin/path, frame không phải top,
  và ancestry trực tiếp. Không nhận iframe trên site khác, tên miền gần giống,
  URL chứa chuỗi ani.pm hoặc embed mở riêng. Edge đã thử; không nới guard chỉ
  để thêm badge hỗ trợ browser khác.
- Runtime gọi initializer của nhiều nền tảng. `initYoutubeSubtitles` phải kiểm
  tra hostname thuộc `youtube.com` hoặc `youtube-nocookie.com` trước khi nhận
  diện đường dẫn. `/embed/v1` trên Settlar không phải video YouTube. Không để
  adapter YouTube thứ hai đăng ký shortcut, dùng chung store hoặc chờ
  `#movie_player` rồi báo thiếu video trên ani.pm.
- `TextTrackFetcher` của ani.pm đặt `allowTrackActivation: false` và
  `manageNativeTrackModes: false`. Chỉ ẩn DOM phụ đề gốc bằng CSS khi dịch;
  Settlar sở hữu mode/CC của track. Việc đổi mode từ showing sang hidden có thể
  khiến player tự tắt nguồn phụ đề, nên không dùng cách đó cho site này.
- Cache phân biệt **đối tượng track**, nguồn video và phần tử video, kể cả
  track thay thế cùng tên/ngôn ngữ. ID video là số thứ tự cục bộ; URL ký số
  không vào ID, prompt, download filename, cấu hình hoặc log đã commit.
- Tái dùng UniversalVideoAdapter, pollPlayerSubtitles, scheduler/queue và
  renderer hiện tại. Đổi tập/nguồn phải reset job và overlay cũ. Invalidation
  phải destroy adapter, tháo logo và UI.
- Logo nằm trước CC; khi player dựng lại controls, chuyển host React hiện có
  sang hàng mới, không tạo nhiều logo. Cô lập sự kiện để bấm logo không play/pause.
- Menu nằm trong overlay của **player**, ngoài controls bị scale của Settlar,
  để nút Skip Intro không đè menu. Giữ menu/caption trong cây fullscreen.
  `controls.findVideoContainer` phải trỏ về `.settlar-player`.
  Giữ `closeSettingsOnEnable: true` cho ani.pm để menu tự đóng sau khi bật;
  các nền tảng khác vẫn giữ hành vi cũ. Đây là policy runtime, không phải trường
  cấu hình lưu trữ và không cần thêm migration.
- Schema **124**, migration `v123-to-v124.ts` là snapshot bất biến, thêm
  `autoStart.anipm = false`. Portable import/export và bootstrap journal phải
  hiểu schema mới nhưng vẫn dùng DB credential hiện có. Không đổi ID DB/journal.
- Giữ OpenAI-only, key riêng, PDF, hai TTS, font tiếng Việt, ghim popup web,
  menu YouTube gốc, các site 1.58 và bộ đệm hai phút như
  [UPSTREAM_UPGRADE_GUIDE.md](UPSTREAM_UPGRADE_GUIDE.md).

## Kiểm chứng và giới hạn

Các test source liên quan nằm tại:

- `src/entrypoints/subtitles.content/platforms/anipm/__tests__/`: guard giả mạo,
  nguồn/video mới, selector thực tế, logo giữ một instance và cleanup.
- `src/utils/subtitles/fetchers/text-track/__tests__/`: không kích hoạt track
  disabled, không sửa mode của player, ms timing, đổi track cùng label và
  khôi phục mode cho các adapter cũ.
- `src/utils/config/__tests__/migration-scripts/v123-to-v124.test.ts` và
  bootstrap integration: giữ cấu hình/key, import/export không mang key vào config.

Browser kiểm chứng: Edge 156.0.4314.58, production build, profile riêng và
key giả. OpenAI Responses được mock trong worker; không dùng key hoặc profile
thật của người dùng. Cue, native player và trang ani.pm là dữ liệu live.
Không diễn giải kết quả này thành đã thử API OpenAI live hoặc mọi tập/server.

Khi nâng cấp, chạy `SKIP_FREE_API=true`, lint/type-check, format và full test;
build ZIP Edge; thử lại logo/menu/style, dịch song ngữ, seek, fullscreen,
tắt để hiện CC gốc, đổi tập và không lộ token/key. Chạy các smoke test cũ cho
YouTube, PDF, TTS, font và update tại chỗ. Không đóng gói profile, fixture,
HAR, token, `.pem` hay CRX.

## Kết quả bản thử ngày 06/11/2026

**Đã sửa:** thêm ani.pm qua native TextTrack, logo cạnh CC, menu gốc, buffer
hai phút; migration 123 → 124; portable config/credential bootstrap và tuỳ chọn
tự dịch riêng cho ani.pm. Build `1.58.0.2`, tên hiển thị `1.58.0A`.

**Đã kiểm thử:**

- **3.902 test đạt, 1 test bị gate bỏ qua**; free-api live được loại có chủ đích
  với `SKIP_FREE_API=true`. Lint/type-check, format và build ZIP Edge đạt.
- **14 assertion trên ani.pm live đạt:** không gọi dịch trước khi bật; logo cạnh
  CC; cue thật qua production runtime hiển thị bản dịch mock; menu/style đầy đủ;
  ẩn/khôi phục chữ gốc; fullscreen chứa logo/UI; đổi tập 1 → 2 giữ đúng một logo,
  không giữ bản dịch cũ; không đưa URL ký số vào request dịch hoặc key vào config.
- Test script dùng chặn riêng quảng cáo đã mô tả ở trên. Không chỉnh DOM hoặc
  thay video/track của ani.pm để tạo kết quả giả. OpenAI được mock trong worker.
- Smoke regression Edge: YouTube với cue +120 giây ở 1× và menu gốc;
  Bilibili/Udemy/Udemy Business/edX; hai OpenAI TTS transport/cache/Stop;
  PDF native với sự kiện menu mô phỏng qua production handler; font tiếng Việt
  và popup web ghim. Các luồng này dùng fixture/API mock như báo cáo nâng cấp 1.58.
- Cập nhật ZIP tại chỗ thực sự từ bản 1.57 trong thư mục test, chỉ install một
  lần rồi giải nén đè/reload: giữ ID, key giả, model, ngôn ngữ, cấu hình hai TTS;
  schema lên 124, ani.pm mặc định false. Không đụng profile/key thật.

**Chưa kiểm thử:** OpenAI live, tất cả tập/phim/server khác của ani.pm,
caption cháy vào video, browser ngoài Edge. Không cam kết player khác Settlar.

**Bị chặn:** không có blocker triển khai. Quảng cáo trong suốt có thể chặn
chuột trên site; bản thử không sửa cơ chế quảng cáo của site.

**ZIP:** `ReadFrog-Edge-1.58.0A-AniPM.zip`, 195 file, 5.923.600 byte.
Manifest `1.58.0.2` / `1.58.0A`; đã kiểm tra entrypoint, không production key,
không profile/test key/`.pem`/CRX trong gói.
SHA-256: `6A4024DC308E55AAC1637D11B2D0365A7067915FA420FA1264222D0D33A10FD5`.

## Bản sửa tiếp theo: 1.58.0.3 / popup 1.58.0-a.2

**Đã sửa:** adapter YouTube trước đây nhận nhầm đường dẫn `/embed/v1` của
Settlar, rồi báo `Video element not found` dù adapter ani.pm đang dịch bình
thường. Thêm guard tên miền ngay đầu initializer YouTube để ngăn chạy nhầm
adapter và đăng ký shortcut trùng. Không ẩn lỗi thiếu video hợp lệ của YouTube.
Menu ani.pm tự đóng sau khi bật dịch; vẫn mở lại để chỉnh style được. Các site
khác không bị đổi hành vi menu. Schema vẫn 124, credential DB không đổi.

**Đã kiểm thử:**

- Tái hiện bản cũ trên ani.pm live: toast xuất hiện sau khoảng 17,5 giây tính
  từ lúc bắt đầu lấy mẫu, trong khi video và logo vẫn tồn tại.
- Cùng phép thử trên bản sửa: **65 mẫu trong hơn 32 giây**, không xuất hiện
  toast; video và đúng một logo còn nguyên trong mọi mẫu.
- **15 assertion ani.pm live đạt**, gồm tự đóng menu khi bật và mở lại chỉnh
  style, dịch cue thật qua API mock, tắt để hiện phụ đề gốc, đổi tập và fullscreen.
  Harness vẫn chỉ chặn script quảng cáo đã mô tả; không sửa DOM/player của site.
- **3.920 test đạt, 1 test bị gate bỏ qua**; `SKIP_FREE_API=true`, free-api live
  được loại có chủ đích. Test mới bắt trường hợp nhầm host, domain giả mạo,
  URL chứa chữ youtube.com, và giữ các embed YouTube/youtube-nocookie thật.
- Lint/type-check, format và build ZIP đạt. Smoke YouTube kiểm tra menu gốc,
  bộ đệm hai phút; các platform 1.58 và cập nhật ZIP tại chỗ cũng được chạy lại.

**Chưa kiểm thử:** URL phim/Naruto chính xác trong ảnh của người dùng chưa
được cung cấp; OpenAI live và các giới hạn player/server khác vẫn như trên.
**Bị chặn:** không có blocker phát hành.

**ZIP mới:** `ReadFrog-Edge-1.58.0A-AniPM-Fix.zip`, 195 file, 5.923.740 byte.
Manifest `1.58.0.3` / `1.58.0A`; popup hiển thị `1.58.0-a.2`.
SHA-256: `9CFD79D58495768D8011A1B8171CF93AEBEE7BFF39768965DE843F826B7B1D0C`.
