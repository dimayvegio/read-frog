# Nâng cấp Read Frog bản local, giữ các tính năng riêng

Tài liệu dành cho người tiếp tục phát triển repo `dimayvegio/read-frog`.
Không dùng tài liệu này để khôi phục bản upstream đè lên bản local.

## Quy ước phiên bản và mốc đối chiếu

**Hậu tố A đánh dấu bản local đã tích hợp upstream và giữ các thay đổi riêng.**
Ví dụ: upstream `v1.58.0` → bản local **1.58.0A**; upstream `v1.59.0` → **1.59.0A**.

| Trường                                   | Bản đang tích hợp                          |
| ---------------------------------------- | ------------------------------------------ |
| Upstream                                 | `mengxi-ream/read-frog`, tag `v1.58.0`     |
| Commit upstream                          | `48dccd04cfdf8432994608215ccad6db329f952b` |
| Tổ tiên chung với upstream 1.57.0        | `e361e991b4127dd0d03473ed9329c24885fe420a` |
| Bản local ngay trước lần nâng cấp này    | `d2e7656ec87837fad331a5e3cda3eaa5b8284d76` |
| Nhánh tích hợp                           | `codex/upstream-1.58-openai`               |
| Nhánh tính năng ani.pm sau merge         | `codex/ani-pm-subtitles`, từ `c9505fad`    |
| Nhánh khôi phục X/Netflix                | `codex/x-netflix-subtitles`, từ `c1ef4a28` |
| `package.json`                           | `1.58.0-a.6` (SemVer hợp lệ)               |
| `manifest.version` trong `wxt.config.ts` | `1.58.0.7` (số hợp lệ cho Edge/Chromium)   |
| `manifest.version_name`                  | `1.58.0A`                                  |
| Schema cấu hình của fork                 | `124`                                      |

Không viết chữ A vào `manifest.version`. Khi phát hành bản sửa tiếp theo trên
cùng upstream, tăng số build cuối, ví dụ `1.58.0.2`; có thể vẫn hiển thị
`1.58.0A`, và dùng `1.58.0-a.1` cho package. Phiên bản package/manifest và
**schema dữ liệu là ba thứ khác nhau**; không ép chúng dùng cùng số.

## Những tính chất và tính năng bắt buộc giữ

Từ build `1.58.0.7`, giữ ZIP v3 (MP3/WAV + DEFLATE 9), đọc v1/v2 và bộ mã hóa
thuần JavaScript được nhúng trong HTML. Giữ kiểm tra MIME/frame/hash, không
tái mã hóa MP3, không đổi lịch/card ID khi xuất; HTML phải chạy cả file URL và
HTTP(S), kể cả khi thiếu SubtleCrypto. DB vẫn version 2, config schema 124;
không viết lại migration v1-to-v2 hoặc đưa mã hóa audio vào transaction.

Từ build `1.58.0.6`, giữ **nhiều sổ từ có tên**, dữ liệu/lịch riêng và ZIP
riêng theo ID sổ. Database từ vựng version 2, có snapshot migration v1-to-v2;
config vẫn schema 124. ZIP v2 mới phải đọc cùng ZIP v1 cũ. Giữ ID khi đổi tên,
không xóa sổ cũ khi tạo sổ mới; cập nhật HTML cùng đường dẫn để giữ IndexedDB.

Từ build `1.58.0.5`, giữ sổ từ vựng local, audio OpenAI, ZIP v1 và HTML ôn tập
độc lập responsive. Đọc [VOCABULARY_LEARNING.md](VOCABULARY_LEARNING.md).
Database `read-frog-vocabulary` version 1 độc lập với config schema 124.
Không xóa database này khi dọn cache/reset cấu hình; giữ audio generation
có cancellation riêng với playback TTS. Mỗi lần build/zip phải tạo lại HTML.

Yêu cầu mới của người dùng có ưu tiên cao hơn tài liệu handoff cũ. Đặc biệt,
OpenAI TTS và PDF đã được người dùng yêu cầu triển khai sau bản handoff nền.
Không xoá chúng vì handoff ban đầu từng ghi chúng là ngoài phạm vi.

**ani.pm cũng là tính năng riêng cần giữ từ build `1.58.0.2`.** Đọc
[ANI_PM_SUBTITLES.md](ANI_PM_SUBTITLES.md) trước khi sửa adapter/player:
giữ guard iframe chính xác, chỉ đọc cue đang tải sẵn, không đổi mode track
của Settlar, menu ngoài controls bị scale và reset khi nguồn video thay đổi
trong cùng iframe. Migration v124 đã phát hành phải giữ nguyên.

Từ build `1.58.0.3`, giữ cả guard hostname đầu `initYoutubeSubtitles`: đường
dẫn `/embed/v1` của Settlar từng bị nhận nhầm là YouTube, gây toast thiếu video
và shortcut trùng sau khi trang đã chạy. Giữ menu ani.pm tự đóng khi bật dịch;
không áp hành vi mới này lên menu các nền tảng khác.

Từ build `1.58.0.4`, **X/Twitter và Netflix đã được khôi phục theo yêu cầu người
dùng** từ đúng tag v1.58.0, vẫn dịch bằng OpenAI riêng. Đọc
[X_NETFLIX_SUBTITLES.md](X_NETFLIX_SUBTITLES.md) khi nâng cấp. Không khôi phục
Read Frog hosted ASR, auth/server hay provider khác cùng các adapter này. Giữ
MAIN-world bridge Netflix, chọn/khôi phục track và native TextTrack X; các field
`autoStart.xcom`/`netflix` đã tồn tại nên schema vẫn là 124.

| Phần phải giữ                                                                                                                      | Điểm kiểm tra trong source                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dịch/phân tích chỉ bằng OpenAI chính thức; không Read Frog login/server, provider dịch khác, proxy, telemetry, Drive hoặc Notebase | `src/types/config/openai.ts`, `src/entrypoints/background/openai-runtime.ts`, `openai-settings.ts`, `background-stream.ts`, `src/utils/providers/`         |
| API key chỉ trong credential DB riêng; không trả key cho content/options, không đưa vào config, backup hay export                  | `src/entrypoints/background/openai-credentials.ts`, `settings-sender.ts`, `src/utils/config/portable.ts`, `src/utils/backup/storage.ts`                    |
| Giữ key khi nâng cấp cùng ID; import/restore/reset thay cấu hình công khai và không kích hoạt key nằm trong file cũ                | `config-bootstrap.ts`, `config.ts`, `config-cleanup.ts`, `src/utils/config/migration.ts`                                                                   |
| Microsoft TTS hoạt động độc lập với OpenAI key; giữ voice/rate/pitch cũ                                                            | `src/utils/server/edge-tts/`, `src/entrypoints/background/tts-request.ts`, `src/hooks/use-text-to-speech.tsx`                                              |
| OpenAI TTS, lựa chọn model/voice/speed/style, cache, Stop và offscreen playback                                                    | `src/types/openai-tts.ts`, `src/entrypoints/background/openai-tts.ts`, `src/entrypoints/options/pages/text-to-speech/`, `src/hooks/use-text-to-speech.tsx` |
| Dịch đoạn được chọn trong PDF native của Edge bằng giao diện dịch vùng chọn hiện có                                                | `src/entrypoints/background/context-menu.ts`, `native-selection.ts`, `src/entrypoints/selection-result/`, `src/utils/selection-result/`                    |
| PDF có thể trả guest tab `-1` hoặc thiếu tab; dữ liệu phải qua session channel ngẫu nhiên, không qua URL chứa văn bản              | `native-selection.ts` và các test lifecycle/context menu/result window                                                                                     |
| Logo, menu, tuỳ chọn kiểu hiển thị phụ đề YouTube của bản gốc                                                                      | `src/entrypoints/subtitles.content/platforms/youtube/`, `renderer/`, `ui/subtitles-settings-panel/`                                                        |
| Dịch trước **120.000 ms ở 1×**, theo tốc độ phát (tối đa hệ số 4); coordinator vẫn lấy 5 đoạn mỗi lượt                             | `src/utils/constants/subtitles.ts`, `src/entrypoints/subtitles.content/translation-coordinator.ts`                                                         |
| AI chia câu cấp đủ dữ liệu cho khoảng dịch trước nhưng không tăng kích thước chunk xử lý chỉ để mở rộng buffer                     | `segmentation-pipeline.ts`: admission window bao phủ translation horizon, chunk vẫn dùng `PROCESS_LOOK_AHEAD_MS`                                           |
| Font tiếng Việt không bị Georgia trên Windows tách dấu; áp dụng cả song ngữ và chỉ bản dịch; khôi phục font gốc khi tắt            | `src/assets/styles/translation-node-preset.css`, `src/utils/host/translate/dom/translation-text-swap.ts`                                                   |
| Popup web có nút ghim, kéo vị trí, không biến mất khi bấm ra ngoài/cuộn; tái sử dụng khi chọn đoạn mới                             | `src/components/ui/selection-popover/`, `src/entrypoints/content-runtime/selection/selection-toolbar/translate-button/`                                    |
| Engine DOM/HTML, inline atom/toán, glossary local/import Undo, queue/batch/cache, streaming/cancellation                           | `src/utils/host/translate/`, `src/utils/glossary/`, `src/entrypoints/background/translation-queues.ts`                                                     |
| Build độc lập, icon và tài nguyên giao diện đóng gói local                                                                         | `wxt.config.ts`, `src/env/`, `scripts/generate-bundled-icons.mjs`                                                                                          |

Popup PDF hiện là cửa sổ Edge riêng, chưa có nút luôn nằm trên mọi cửa sổ.
Không ghi nút ghim popup web là tính năng always-on-top của Windows.

Các mốc phát triển riêng giúp rà lại ý định khi có xung đột:

- `76eaa563`: nền OpenAI-only, key riêng và khôi phục phụ đề YouTube.
- `bb210766`: dịch vùng chọn PDF native.
- `59aa5d82`: OpenAI TTS cùng Microsoft TTS, schema 122.
- `c8295186`: sửa chuyển vùng chọn PDF khi guest tab không có ID hợp lệ.
- `3530c9db`: font cho bản dịch tiếng Việt.
- `d2e7656e`: dịch trước phụ đề hai phút, đồng bộ cửa sổ chia câu.

## Quy trình tích hợp upstream lần sau

1. Đọc `AGENTS.md`, tài liệu này, release notes và yêu cầu mới nhất của người dùng.
   Chạy `git status --short`, `git log -n 10 --oneline`, `git remote -v`.
   Ghi commit local bắt đầu; giữ nguyên thay đổi chưa commit của người dùng.
2. Xác minh tag và SHA upstream. Fetch đúng tag phát hành, không lấy `main`
   đang phát triển thay cho release. Ví dụ:

   ```powershell
   git fetch --no-tags https://github.com/mengxi-ream/read-frog.git tag v1.59.0
   git rev-parse v1.59.0
   git log --oneline v1.58.0..v1.59.0
   git diff --stat v1.58.0 v1.59.0
   ```

3. Tạo nhánh `codex/upstream-<version>-openai` từ **bản local hiện có**.
   Merge tag với `git merge --no-commit --no-ff <tag>` để giữ lịch sử và có thể
   đối chiếu các lần sau. Không reset/rebase bản local lên upstream rồi bỏ
   các commit riêng; không chọn toàn bộ `--theirs` cho source hay lockfile.
4. Rà từng xung đột theo bảng tính năng ở trên. Khi upstream sửa đoạn code
   đã bị fork loại bỏ, giữ lý do loại bỏ: ví dụ bản sửa Google Translate
   không phải lý do để khôi phục Google provider; bản sửa Notebase không
   phải lý do để khôi phục note-origin hoặc cloud sync.
5. Chỉ cập nhật dependency cần cho thay đổi upstream đã nhận. Không lấy
   nguyên package/lockfile upstream để kéo lại API contract, auth client,
   analytics hay server packages đã gỡ. Không nâng AI SDK đồng thời khi
   không cần thiết. Kiểm tra lại tài nguyên/network của dependency mới.
6. Làm migration riêng theo phần dưới. Chạy đầy đủ validation, đóng ZIP,
   rồi mới commit/push. PR nếu có phải dùng conventional commit title.
7. Cập nhật bảng phiên bản đầu tài liệu và kết quả thực tế của đợt phát hành.
   Không sửa lịch sử để biến test mock thành test live.

## Migration: số của fork không còn giống số upstream

Đây là điểm dễ làm mất key hoặc khiến extension không khởi động.

- `v120-to-v121.ts` **của fork** là projector OpenAI-only và bỏ secret khỏi
  public config. `v121-to-v122.ts` **của fork** thêm OpenAI TTS.
- Upstream 1.58.0 cũng thêm `v120-to-v121.ts`, nhưng để thêm Bilibili/Udemy/edX.
  Hai file trùng tên nhưng khác ý nghĩa. **Giữ nguyên hai bước đã phát hành
  của fork**, chuyển logic thêm platform thành `v122-to-v123.ts`.
- Với upstream sau: lấy số lớn nhất **đã phát hành của fork**, thêm bước liên
  tiếp mới. Không chèn vào giữa hay viết lại migration đã chạy trên máy người dùng.
- Mỗi migration là snapshot thuần: giá trị literal, không import helper,
  constant, factory hoặc type đang thay đổi. Giữ lựa chọn cũ, idempotent,
  không sửa trực tiếp input. Đọc `.agents/skills/migration-scripts/SKILL.md`.
- Đồng bộ `CONFIG_SCHEMA_VERSION`, registry tự kiểm tra chuỗi liên tục,
  `portable.ts`, giới hạn `BootstrapJournal` trong credential storage và
  version đích của bootstrap. Tên DB `edge-openai-credentials` phải ổn định.
- Thêm fixture cho schema mới và test upgrade từ schema fork đang dùng,
  cả import/restore cùng version. API key giả/sentinel phải không xuất hiện
  trong config/export, và key riêng đang lưu phải còn nguyên sau update.
- Platform mới mặc định **không tự dịch khi mở**; giữ lựa chọn auto-start
  hiện tại. Không bật một tính năng gọi API chỉ vì người dùng nâng cấp.

## Site adapters và phạm vi mạng

Bản 1.58.0A nhận các adapter mới **Bilibili, Udemy/Udemy Business và edX**,
ngoài YouTube đang có. Cấu hình cũ có thể vẫn chứa trường X/Netflix để bảo
toàn dữ liệu; trong bản fork này chúng không được bật trong runtime/menu.
Không quảng cáo hỗ trợ chỉ vì schema còn một tên platform.

- Dữ liệu phụ đề lấy từ player/track/API của chính nền tảng đang mở; người
  dùng tự đăng nhập nền tảng nếu video hoặc phụ đề đòi quyền truy cập.
- Bilibili: interceptor đọc thông tin phụ đề của player; có nhánh lấy lại
  signed player-info URL mà trang đã yêu cầu. Đây là request tới nền tảng,
  không phải dịch vụ tạo transcript của Read Frog.
- Udemy: đọc course/lecture captions từ site đang mở, ưu tiên ngôn ngữ khoá
  học và phụ đề được tải lên; hỗ trợ domain Udemy Business.
- edX: dùng metadata transcript của video đang phát và ngôn ngữ đang chọn.
- Văn bản dịch/phân tích vẫn chỉ đi qua background OpenAI chính thức.
  OpenAI key không đi vào player, page bridge, metadata URL hay request lấy caption.
- Không khôi phục AI transcript từ server Read Frog, nút quota/thanh toán
  hoặc đăng nhập extension để làm một platform có vẻ hoạt động.
- Site mới cần test không có phụ đề, đổi video/track, SPA navigation, Stop,
  quảng cáo/nhiều video và cleanup; phân biệt fixture với site live.

## Validation bắt buộc trước khi giao ZIP

Các lệnh PowerShell sau dùng pnpm theo `packageManager` của repo:

```powershell
$env:SKIP_FREE_API = 'true'
pnpm exec oxfmt --check .
pnpm exec oxlint --type-aware --type-check
pnpm exec nx test --output-style=static -- '--exclude=**/free-api.test.ts'
pnpm zip:edge
git diff --check
```

`free-api.test.ts` dùng dịch vụ ngoài được bỏ qua có chủ đích theo AGENTS.md.
Test gọi API/TTS live khác có thể cũng bị gate; ghi rõ cái gì đã hoặc chưa chạy.
Không coi lint và type-check là hai lớp độc lập nếu cùng gọi oxlint.

Ưu tiên xem lại các test đã theo dõi trong repo:

- `src/entrypoints/background/__tests__/openai-credentials.test.ts`,
  `config-bootstrap.test.ts`, `openai-runtime.test.ts`, `openai-tts.test.ts`.
- `src/utils/config/__tests__/config.test.ts` và `migration-scripts/`.
- `src/entrypoints/background/__tests__/native-selection.test.ts`,
  `context-menu.test.ts`; `src/entrypoints/selection-result/__tests__/app.test.tsx`.
- `src/entrypoints/subtitles.content/__tests__/translation-coordinator.test.ts`,
  `segmentation-pipeline.test.ts`, `universal-adapter.test.ts`,
  `subtitles-scheduler.test.ts` và test fetcher/platform mới.
- Các test DOM/HTML/inline atom/glossary, port streaming và hook TTS.

Kiểm thử bản build production trên profile Edge riêng với API mô phỏng,
không dùng key thật của người dùng để chạy test tự động:

| Luồng               | Điều phải quan sát                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Update đè từ ZIP cũ | Chỉ cài một lần, giải nén đè cùng thư mục rồi Reload; cùng ID; key và cài đặt TTS, prompts, glossary, auto-start còn nguyên; schema mới |
| YouTube             | Logo/menu gốc; dịch được cue ở +120 giây khi video đứng ở 0; không dịch luôn cả video; seek và Stop hoạt động                           |
| Site mới            | Nút dịch đúng player; tải đúng track; đổi video/track không giữ kết quả cũ; không xuất hiện server/auth Read Frog                       |
| Web selection       | Dịch/stream, copy, speak; ghim rồi bấm ra ngoài và cuộn không đóng hoặc nhảy vị trí                                                     |
| PDF native Edge     | Bôi đen → context menu → Translate; giả lập guest tab `-1` và thiếu tab; kiểm riêng thao tác native nếu công cụ làm được                |
| TTS                 | Cả Microsoft và OpenAI; Stop/cancel; không có key vẫn dùng Microsoft; không gửi OpenAI key tới Microsoft                                |
| Font VI             | Trang dùng Georgia; song ngữ và chỉ bản dịch đọc được dấu; tắt dịch trả text và font nguồn                                              |
| Backup/export       | Không chứa API key; import không phục hồi endpoint/provider/auth bị gỡ                                                                  |

Script và bằng chứng trong `.codex/` là scratch của từng máy và không được
commit/đóng gói. Không dùng chúng làm bước CI duy nhất mà bỏ các test source
đã liệt kê. Không gọi một tương tác native là đã test khi chỉ seed storage.

## ZIP và cách cập nhật cho người dùng

Chỉ giao **một file ZIP**. Không giao CRX, `.pem`, source ZIP, `.env`, key
thật hoặc profile/test fixture. ZIP phải có `manifest.json` ngay tại root,
version hiển thị có hậu tố A và đủ file được manifest tham chiếu.

Với extension Load unpacked đang dùng:

1. Giải nén ZIP mới **đè vào đúng thư mục Edge đang nạp**.
2. `edge://extensions` → **Reload** tại thẻ Read Frog đang có.
3. Tải lại trang web/YouTube hoặc mở lại PDF.

Giữ thư mục và ID extension hiện có để giữ dữ liệu. Không yêu cầu người dùng
gỡ rồi cài lại hoặc chọn một thư mục mới cho mỗi phiên bản. Không thêm một
`manifest.key` mới vào bản production đang cài để "ổn định ID": thay đổi đó
có thể đổi origin và làm key/cấu hình cũ không còn thấy được.

Hướng dẫn chính thức: [Microsoft — cập nhật extension cài thủ công](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading#locally-updating-an-extension-reload).

## Mẫu bàn giao mỗi lần nâng cấp

- **Đã sửa:** version A, tag/SHA upstream, thay đổi nhận vào, cách giải quyết
  xung đột và phần upstream không áp dụng cho fork.
- **Đã giữ:** đối chiếu từng mục trong bảng tính năng riêng; báo migration,
  key, import/export, Microsoft/OpenAI TTS và buffer hai phút.
- **Đã kiểm thử:** lệnh, số test, profile/browser, mock hay live, bằng chứng
  cập nhật đè, kiểm tra nội dung ZIP và SHA-256.
- **Chưa kiểm thử:** tên site thật/tài khoản/luồng native/API live chưa chạy.
- **Bị chặn:** ghi điều kiện chặn thực tế; nếu không có thì ghi không có.
- Nhánh/commit đã push và link **ZIP duy nhất** cho người dùng.

Release upstream đã đối chiếu: [Read Frog v1.58.0](https://github.com/mengxi-ream/read-frog/releases/tag/v1.58.0).

## Kết quả kiểm chứng đợt 1.58.0A

Ngày 06/11/2026, đối chiếu local `d2e7656e` với tag upstream `48dccd04`.

**Đã sửa:** tích hợp ba nền tảng mới, các sửa lỗi CNN/NASA/RFC, lifecycle
player/track và formula rendering của layout engine. Nhận definitions 0.15.0,
layout-engine 0.8.0 và Temml 0.14.0; giữ nguyên AI SDK đang dùng. Không nhận
lại Google Translate, Notebase, auth/server/telemetry hoặc các dependency đã gỡ.

**Đã giữ:** runtime/provider/key, Microsoft/OpenAI TTS, PDF, font tiếng Việt
và nút ghim popup web. `TRANSLATE_LOOK_AHEAD_MS = 120_000`, coordinator batch
5 đoạn, và cửa sổ chia câu đủ cấp dữ liệu cho khoảng dịch trước. Hai migration
v121/v122 đã phát hành giữ nguyên; thêm v123 cho các platform mới.

**Đã kiểm thử:**

- Bộ test source: **3.879 đạt**, **1 test bị gate bỏ qua**; free-api live được
  loại có chủ đích với `SKIP_FREE_API=true` theo AGENTS.md. Lint/type-check,
  format và build ZIP Edge đạt.
- Edge **156.0.4314.58**, profile riêng, API và player/track mô phỏng:
  Bilibili (gồm MAIN-world bridge), Udemy, Udemy Business, edX; menu/logo,
  caption fetch và request dịch đi qua OpenAI chính thức. Request lấy caption
  không có OpenAI Authorization header.
- YouTube: vị trí logo/menu/style gốc, dịch trước tới cue +120 giây tại
  thời điểm 0, seek dùng dữ liệu đã dịch, Stop và dịch trang/khôi phục.
- PDF: reader native thật cùng sự kiện context menu guest `-1` mô phỏng gọi
  production handler; đổi vùng chọn, stream/Stop, chọn ngôn ngữ, lỗi/thiếu key.
- OpenAI TTS: hai transport, preview/offscreen, cache, Stop đóng Realtime,
  đọc bản dịch PDF; giữ voice/rate Microsoft và không lộ key trong public storage.
- Trang dùng Georgia: cả hai chế độ dịch hiển thị dấu đúng, khôi phục text/font
  gốc; popup web ghim vẫn ở vị trí cũ khi bấm ngoài/cuộn.
- **Update-in-place thực sự:** cài ZIP 1.57.0A một lần vào thư mục test, ghi
  key giả và cấu hình riêng, giải nén đè ZIP 1.58.0A rồi `runtime.reload()`.
  Cùng ID, key, model, ngôn ngữ, Microsoft voice/rate, OpenAI voice/style/speed
  vẫn giữ; schema lên 123; các site mới mặc định không tự dịch.

**Chưa kiểm thử:** tài khoản/video có đăng nhập thật trên Bilibili, Udemy,
Udemy Business và edX; OpenAI/Microsoft API live; chuột phải native PDF bằng
UI automation trên tài liệu của người dùng; các luồng Firefox/Safari.
Các kết quả Edge ở trên là production build với fixture, không phải cam kết
đã thử mọi player hoặc mọi site live.

**Bị chặn:** không có blocker triển khai/phát hành ZIP. Không thay đổi hoặc
đọc key thật hay profile trình duyệt đang dùng của người dùng.

**Artifact đã kiểm tra:** `ReadFrog-Edge-1.58.0A.zip`, 195 file,
5.922.074 byte; manifest `1.58.0.1` / `1.58.0A`, không thêm production key.
SHA-256: `7EA6F21E05B94CACA6DFC195C1E7797CB06EF70AEBB588C1FA43169314FEE0F9`.
Đã kiểm tra các file entrypoint của manifest tồn tại và không đóng gói fixture,
profile, `.env`, `.pem`, CRX hoặc các sentinel key dùng trong test.
