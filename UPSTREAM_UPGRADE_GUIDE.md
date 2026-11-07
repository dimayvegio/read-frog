# Nâng cấp Read Frog bản local, giữ các tính năng riêng

Tài liệu dành cho người tiếp tục phát triển repo `dimayvegio/read-frog`.
Không dùng tài liệu này để khôi phục bản upstream đè lên bản local.

Đọc [FORK_DIFFERENCES.md](FORK_DIFFERENCES.md) trước: bảng đối chiếu upstream
`v1.58.0` với source local `7ccf0ad7`, mã hành vi F01–F18, điểm conflict,
ledger schema/DB/ZIP và các giới hạn đã xác minh. Tài liệu này hướng dẫn
**cách merge lần tiếp theo**; các báo cáo/tài liệu chức năng giữ bằng chứng
chi tiết của từng bản phát hành. Ràng buộc cần bảo toàn là hành vi và dữ liệu;
chỉ migration/schema/format đã phát hành phải đóng băng, không đóng băng toàn
bộ implementation để rồi bỏ lỡ bug fix upstream.

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
| `package.json`                           | `1.58.0-a.25` (SemVer hợp lệ)              |
| `manifest.version` trong `wxt.config.ts` | `1.58.0.26` (số hợp lệ cho Edge/Chromium)  |
| `manifest.version_name`                  | `1.58.0A`                                  |
| Schema cấu hình của fork                 | `124`                                      |
| Nhánh local hiện hành                    | `codex/pdf-reading-panel`                  |
| Mốc source kiểm toán                     | `7ccf0ad7c6ff62a6551485eefe45e852bca087da` |

Không viết chữ A vào `manifest.version`. Khi phát hành bản sửa tiếp theo trên
cùng upstream, tăng số build cuối, ví dụ `1.58.0.2`; có thể vẫn hiển thị
`1.58.0A`, và dùng `1.58.0-a.1` cho package. Phiên bản package/manifest và
**schema dữ liệu là ba thứ khác nhau**; không ép chúng dùng cùng số.

## Những tính chất và tính năng bắt buộc giữ

Từ build `1.58.0.25`, giữ **F22 — Luyện phát âm Mỹ** trong
[AMERICAN_PRONUNCIATION.md](AMERICAN_PRONUNCIATION.md): nút Translate/Dictionary,
explicit audio upload, rubric nửa điểm, conservative feedback và logs/report riêng.
Không chuyển F19 sang auto-upload, không dùng điểm phát âm để đổi SRS. Giữ
credential/sender/epoch/cancellation/cache guards, pronunciation DB1/report1 và
regression audio giả lập trên production Edge. Không tuyên bố test mock đã
xác minh độ chính xác chấm giọng thật.

Từ `1.58.0.26`, giữ adapter response v2 cho từ đơn: chỉ 3 tiêu chí, N/A do app
sở hữu, normalize JSON/score hữu hạn trước canonical validation, chất lượng
không đủ vẫn không điểm, mã lỗi PA an toàn và không có paid auto-repair.
Không quay lại chặn toàn bộ nhận xét chỉ vì model trả rhythm/fluency cho một từ.

Từ build `1.58.0.24`, giữ **F21 — Khung song ngữ HTML** trong
[HTML_BILINGUAL_READING.md](HTML_BILINGUAL_READING.md): đọc kết quả đã commit
ở cả hai mode của engine, không tạo translator/queue/cache thứ hai. Giữ
capture trước request, weak/bounded metadata, source/parent validity,
route/restore epochs, main-frame isolated UI và cleanup khi đóng/thu gọn.
Nhận fix upstream cho engine đồng thời điều chỉnh các hook sau commit;
không bỏ guards của virtual/swap/fallback để UI dễ tích hợp. Không đổi schema.

Từ build `1.58.0.23`, có thêm **F20 — PDF song ngữ theo đoạn** trong
[PDF_BILINGUAL_READING.md](PDF_BILINGUAL_READING.md). Giữ hai khung, overlay
không sửa source DOM, cuộn liên kết và dịch trang/đoạn opt-in; cache-only không
gọi provider, context/clear-epoch và abort khi đổi trang/file/tắt. Không thay
PDF DB2 hoặc tự đọc/upload/dịch toàn tài liệu. Giữ ba canvas, nguồn worker local,
keyed PDF host và regression `check-pdf-bilingual.mjs` bên cạnh test PDF cũ.

Từ build `1.58.0.22`, danh mục có thêm **F19** trong
[READING_LAB.md](READING_LAB.md): nghe xen kẽ/MP3, thư viện DB1/ZIP1 và
shadowing local. Giữ sender guards, one-use capture, index-only AI alignment,
private TTS, epoch/revision và cleanup micro. Đừng kéo thư viện/bản thu vào
config sync hoặc biến shadowing thành điểm đúng/sai của sổ từ.

Từ build `1.58.0.20`, hợp đồng F09 có thêm **Tải MP3 OpenAI**. Đọc
[OPENAI_TTS_DOWNLOAD.md](OPENAI_TTS_DOWNLOAD.md): giữ cache dùng chung và
in-flight reuse, ghép đủ toàn đoạn bằng một encoder, tải theo thao tác người dùng
và cancellation riêng với playback/sổ từ. Quyền `downloads` và RPC/port mới phải
giữ sender/size/MP3 validation. Không thêm migration hoặc đổi transport/model TTS.

Từ build `1.58.0.19`, giữ khung Learning kéo/resize độc lập hai chiều, pointer
capture, keyboard/reset, clamp viewport/fullscreen và preference local
`subtitlesSidebarWindowV1`. Không remount transcript theo pointer move, không
gửi geometry qua config124/Edge sync1. Xem [STUDY_FLOW_AND_USAGE.md](STUDY_FLOW_AND_USAGE.md).

Từ build `1.58.0.18`, giữ track luyện nghe YouTube riêng chỉ gọi OpenAI khi bật,
chia câu bằng chỉ số CC có kiểm tra đầy đủ, giữ câu ngắn và carry câu cuối qua
cửa sổ. Không đưa qua display optimizer, giữ hủy port/guard và dung sai seek
khi browser làm tròn mốc thời gian ước lượng. Giữ ngôn ngữ đích rõ ràng cho
dịch ảnh/PDF với prompt riêng và cache tách theo target code. Xem
[STUDY_FLOW_AND_USAGE.md](STUDY_FLOW_AND_USAGE.md),
[IMAGE_TRANSLATION.md](IMAGE_TRANSLATION.md).

Từ build `1.58.0.17`, giữ Edge native configuration sync opt-in, DB riêng1 và
transport1 frozen config124: gzip/chunks/checksum, head-last commit, vector
conflicts, sender guard và persistent recovery/undo. Không sync credential hoặc
DB glossary/vocabulary/PDF/image/usage, không đổi extension ID âm thầm. Khi
nâng config schema phải thêm reader/writer sync mới. Không khôi phục nút Send
feedback cũ. Xem [EDGE_SETTINGS_SYNC.md](EDGE_SETTINGS_SYNC.md).

Từ build `1.58.0.16`, giữ vocabulary DB5 additive store `sources`, ZIP6 và
đọc ZIP1-5; không đổi định nghĩa DB1-4 hoặc schema review logs đã phát hành.
Giữ đánh dấu từ theo bằng chứng của sổ đang chọn mà không sửa DOM trang,
luyện câu YouTube opt-in, lịch sử nhiều câu nguồn và usage DB1 chỉ chứa
số liệu, không prompt/key/URL. Xem [STUDY_FLOW_AND_USAGE.md](STUDY_FLOW_AND_USAGE.md).

Từ build `1.58.0.15`, danh sách chọn ngôn ngữ dùng chung ưu tiên `eng` rồi
`vie`, sau đó giữ thứ tự cũ của các ngôn ngữ còn lại. Popup, dịch bôi đen,
PDF/ảnh, Translation Hub và dịch ô nhập liệu phải dùng chung thứ tự này.
Đây là thứ tự UI, không đổi ngôn ngữ đã chọn hoặc schema cấu hình.

Từ build `1.58.0.14`, giữ cache ảnh DB1 tách riêng (chỉ hash/chữ/bản dịch),
500 record/16 MiB/30 ngày, LRU và clear epoch. Giữ cả OCR hai bước và một
lượt structured original/translation, cache riêng từng loại, kiểm fingerprint
trước khi dùng bản dịch một lượt trong khung chung. Glossary có từ hoặc prompt
khác Default dùng hai bước; Regenerate/Đọc lại ảnh bỏ qua cache. Giữ command
`capture-and-translate`, Alt+Shift+S gợi ý và hiển thị binding thật từ browser.
Đo benchmark phải ghi rõ API mô phỏng hay live, xem [IMAGE_TRANSLATION.md](IMAGE_TRANSLATION.md).

Từ build `1.58.0.13`, giữ chụp/crop/paste ảnh, canvas PDF, OpenAI OCR rồi dịch
text qua engine chung. Giữ sender guard, one-shot RAM channel, chỉ crop gửi
provider và không lưu ảnh trong DB/settings. Port `stream-image-text` chỉ cho
image editor; các port text/structured cũ không nhận thêm ảnh. Không tự đổi
model/key. Xem [IMAGE_TRANSLATION.md](IMAGE_TRANSLATION.md).

Từ build `1.58.0.12`, giữ trình đọc PDF.js riêng và tự lưu trang/scroll/zoom theo
SHA-256 nội dung file. PDF DB2 chỉ thêm `positions`/`positionEpochs`; DB1 giữ
nguyên. Lưu qua background với timestamp/epoch để tab cũ không ghi đè hoặc hồi
sinh vị trí đã xóa. Worker/font/CMap/decoder phải local, chỉ render ba trang gần
vùng đọc; không chạy script PDF hoặc upload toàn file. Giữ fallback chọn file
khi thiếu file URL permission và khung dịch dùng chung. Không hứa auto tracking
trong Edge native. Xem [PDF_LOCAL_READING.md](PDF_LOCAL_READING.md).

Từ build `1.58.0.11`, giữ sidebar PDF, làm sạch bảo thủ và lịch sử/cache riêng
theo tài liệu trong [PDF_LOCAL_READING.md](PDF_LOCAL_READING.md). Giữ gesture
trước await, popup fallback, hash tài liệu không gửi path và cache theo prompt/
model/glossary/credential. PDF history DB1 độc lập; giữ cancellation/clear epoch
và kiểm thử production Edge. Không upload toàn file hoặc sửa migration cũ.

Từ build `1.58.0.10`, giữ luyện gõ/sửa/gợi ý/nghe/điền câu, Học hôm nay,
buổi đang dở local (DB4 thêm `learningRuns`), save từ Dictionary và log hỗ trợ
riêng với tự nhớ. ZIP5/report3 giữ exercise metadata và đọc ZIP1–4 bằng schema
đã đóng băng. SRS tối đa một lần/từ/buổi, gõ sửa không tăng đúng; Markdown cho
ChatGPT gọn cả với 1.000 từ nhưng vẫn có tiến trình từng từ. JSON/ZIP giữ event
đầy đủ và ID không trùng. Giữ bài kiểm tra production scale 1.000 từ/2.000 audio.

Từ build `1.58.0.9`, giữ report JSON v2 và Markdown cho ChatGPT: danh sách từ
cần ôn kèm bằng chứng, phân biệt từ chưa kiểm tra với từ có lỗi. Phân nhóm theo
toàn bộ nhật ký của từ còn trong sổ, độc lập bộ lọc thống kê; giải thích quy tắc
và không coi một lần đúng/tự chấm là xác nhận đã thuộc. DB3/ZIP4/config124 giữ
nguyên; không thay dữ liệu gốc để tạo phân nhóm dẫn xuất.

Từ build `1.58.0.8`, giữ store `reviewEvents` của DB v3, ZIP v4 với
`reviews.json` và báo cáo JSON v1. Đọc ZIP v1/v2/v3; không dựng lại lịch sử
đúng/sai từ counter cũ. ID lượt kiểm tra bền qua ZIP; ghi đáp án đầu tiên ngay
khi kiểm tra, chấm lịch ôn cùng grade của event trong transaction, không đếm
trùng. Giữ tách kết quả tự chấm thẻ lật, trả lời tự động và mở đáp án. Log/report
chạy local trên file URL/HTTP, không phụ thuộc API/hosted services.

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

1. Đọc `AGENTS.md`, [FORK_DIFFERENCES.md](FORK_DIFFERENCES.md), tài liệu này,
   tài liệu của các nhóm F bị ảnh hưởng và yêu cầu mới nhất của người dùng.
   Chạy `git status --short`, `git log -n 10 --oneline`, `git remote -v`.
   Ghi SHA local bắt đầu và tag upstream cuối đã tích hợp. Giữ thay đổi chưa
   commit của người dùng; nếu có, cô lập phần nâng cấp trên checkout/worktree
   phù hợp để không làm mất hoặc gộp thay đổi không liên quan vào bản nâng cấp.
2. Chuẩn bị dữ liệu để kiểm chứng update: settings export public, ZIP từng sổ
   từ và logs, trạng thái key đã cấu hình, tên/thư mục/ID extension đang cài.
   Settings export **không backup key**, và Git không backup các DB của browser.
   Dùng profile test có sentinel, không trích key thật vào fixture/tài liệu.
3. Xác minh release notes, tag và SHA upstream do người dùng chọn. Fetch đúng
   tag, không lấy `main` phát triển thay cho release. Dùng namespace tag riêng
   để không ghi đè tag đã có. Ví dụ dưới là template, cần thay `<VERSION>`:

   ```powershell
   $forkStart = (git rev-parse HEAD).Trim()
   $previousUpstream = '48dccd04cfdf8432994608215ccad6db329f952b'
   $targetTag = 'v<VERSION>'
   $incomingRef = "refs/tags/upstream/$targetTag"
   git fetch --no-tags https://github.com/mengxi-ream/read-frog.git "refs/tags/${targetTag}:${incomingRef}"
   git rev-parse "${incomingRef}^{commit}"
   git log --oneline "$previousUpstream..$incomingRef"
   git diff --stat $previousUpstream $incomingRef
   git diff --name-status $previousUpstream $incomingRef
   git diff --name-status $previousUpstream $forkStart
   ```

   Khi chạy lệnh thật, kiểm tra exit code từng bước; dừng nếu fetch/resolve
   thất bại. Không dùng SHA/table ở ví dụ để khẳng định một release mới chưa
   kiểm tra. Lần nâng cấp sau nữa phải thay `$previousUpstream` bằng SHA vừa
   tích hợp và ghi nhận, không luôn giữ baseline1.58.

4. Lập bảng thay đổi upstream theo mẫu ở cuối tài liệu: **nhận nguyên logic /
   điều chỉnh cho fork / bỏ qua có lý do / chưa port**. Mỗi mục ghi commit,
   feature/fix, nhóm F, quyết định và test sẽ chạy. Mục Notebase/cloud/provider
   có thể bỏ phần dịch vụ nhưng vẫn lấy được bug fix parser/DOM chung; nguồn
   câu local của vocabulary là F14 riêng, không phải dịch vụ Notebase.
5. Tạo nhánh `codex/upstream-<version>-openai` từ **local mới nhất** đã ghi ở
   bước1. Merge tag đã xác minh bằng `git merge --no-commit --no-ff <ref>` để
   giữ ancestry. Không reset/rebase local lên source upstream rồi chép lại
   vài file. Không chọn toàn bộ `--ours`/`--theirs`, kể cả lockfile: `ours`
   có thể bỏ mất bug fix mới, `theirs` có thể xóa tính năng riêng.
6. Giải quyết conflict theo nhóm F và source map, rồi rà cả phần Git tự merge
   không báo conflict: entrypoint/matches, MAIN bridge, message/port contract,
   package exports, provider resolution, defaults, i18n, cache identity và
   compiled assets. Di chuyển file được phép; chỉ tạo một controller/bridge
   hoạt động. Không chỉ hiện nút để giả hỗ trợ platform hoặc tính năng.
7. Chỉ cập nhật dependency cần cho thay đổi upstream đã nhận. Không lấy
   nguyên package/lockfile upstream để kéo lại API contract, auth client,
   analytics hay server packages đã gỡ. Không nâng AI SDK đồng thời khi
   không cần thiết. Kiểm tra lại tài nguyên/network của dependency mới.
8. Làm migration theo phần dưới **chỉ khi cần đổi dữ liệu**. Kiểm riêng
   config124 và transport Edge sync1: schema mới cần reader/writer sync mới,
   xử lý client cũ, conflict và recovery; không drop field mới để ép vừa124.
   Giữ lựa chọn model/TTS/auto-start; tính năng AI mới không tự bật sau update.
9. Chạy validation source và production, rồi kiểm update tại chỗ từ ZIP đang
   phát hành. Đóng một ZIP và kiểm nội dung, tạo lại HTML ôn từ. Sau khi các
   kiểm tra cần thiết đạt mới commit/push. Cập nhật mốc upstream/local/version,
   ma trận F, ledger dữ liệu và báo cáo; PR nếu có dùng conventional title.
   Ghi rõ phần chưa port/chưa thử; không dùng kết quả cũ hoặc mock làm live.

Nếu phải hủy một merge đang dở, chỉ abort thao tác merge của chính đợt nâng
cấp; giữ source/artifact cũ và thay đổi của người dùng. Khi đã phát hành schema
mới, rollback mã nguồn không có nghĩa DB tự downgrade: đánh giá compatibility
và backup riêng trước khi nạp binary cũ. Không uninstall extension để rollback.

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
- Schema124 hiện còn gắn với Edge sync transport1. Nếu lên125+, thêm protocol
  reader/writer phù hợp và kiểm đồng bộ với client cũ/mới; không sửa reader1
  để âm thầm lược bỏ dữ liệu. DB vocabulary5/PDF2/image1/usage1/sync1, ZIP6
  và report3 có version độc lập; xem ledger trong `FORK_DIFFERENCES.md`.
- Thêm fixture cho schema mới và test upgrade từ schema fork đang dùng,
  cả import/restore cùng version. API key giả/sentinel phải không xuất hiện
  trong config/export, và key riêng đang lưu phải còn nguyên sau update.
- Platform mới mặc định **không tự dịch khi mở**; giữ lựa chọn auto-start
  hiện tại. Không bật một tính năng gọi API chỉ vì người dùng nâng cấp.

## Site adapters và phạm vi mạng

Bản hiện tại có **YouTube, X/Twitter, Netflix, Bilibili, Udemy/Udemy Business,
edX và ani.pm**. Bilibili/Udemy/edX nhận từ tag1.58.0; X/Netflix được khôi
phục từ cùng tag ở `cb6a3cc9`, gồm runtime/menu/bridge. Ghi chú cũ rằng
X/Netflix chỉ còn trong schema không còn đúng với bản này. ani.pm là adapter
riêng của fork. Danh sách hỗ trợ cần kiểm cả entrypoint/matches/fetcher/UI,
không chỉ có tên trong schema; khả năng lấy CC còn tùy video/track/platform.

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

Bổ sung các cửa kiểm tra từ các bản local sau merge1.58 ban đầu:

| Nhóm             | Điều phải chứng minh                                                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F05–F06 Learning | Mở tab Learning chưa gọi AI; bật mới chia CC, giữ câu ngắn/câu >15 từ và carry; cache/seek/lặp/ad/input/SPA/cancel; kéo/resize/reset/fullscreen/persistence không remount transcript hoặc tự bật AI |
| F07–F08 Captions | ani.pm thụ động, không đổi disabled-track mode; YouTube hostname guard; X ownership/native track; Netflix MAIN bridge, movie/track identity và restore; Bilibili/Udemy/edX vẫn vào runtime          |
| F10 PDF.js       | Cùng hash dù đổi tên vẫn resume; chỉ3 canvas; position/history clear epoch; PDF guest-tab selection vào khung hoặc popup fallback, file không copy được dùng capture/OCR                            |
| F11 Ảnh          | Fast1 request/hai bước2 request/warm0 khi cùng context; crop-only, sender, hủy/clear epoch; custom prompt ghi Chinese nhưng pickerViệt/Anh vẫn gửi đúng đích và không lẫn cache                     |
| F12–F14 Sổ từ    | UpgradeDB cũ; nhiều sổ/ZIP riêng; nhậpZIP1–6; HTML file/HTTP/mobile; MP3/WAV, IDs, first-answer logs, assisted/SRS/source không đếm trùng; regression1.000 từ/2.000 audio                           |
| F15 Usage        | Token SDK/cache/cost/unknown-price/latency/clear epoch; không prompt/URL/key hoặc giả số liệu live                                                                                                  |
| F16 Edge sync    | Chunks-first/head-last, checksum, vector conflict/stale-preview, recovery/undo, quota, trusted sender và cùngID; relay mock phải báo đúng là mock                                                   |

Các browser regression được theo dõi trong repo:

```powershell
node scripts/debug/check-study-flow.mjs
node scripts/debug/check-vocabulary.mjs
node scripts/debug/check-vocabulary-scale.mjs
$env:PDF_IMAGE_SKIP_BENCHMARK = '1'
node scripts/debug/check-pdf-reading.mjs
node scripts/debug/check-edge-settings-sync.mjs
```

`check-study-flow` gọi cả `check-sidebar-window`; `check-pdf-reading` gọi PDF
autosave/image/fast regression. Biến skip ở trên chỉ bỏ benchmark latency lịch
sử, không bỏ kiểm đúng/sai chức năng. Muốn công bố số liệu tốc độ mới thì chạy
benchmark riêng, ghi môi trường và độ trễ mock/live.

Chuẩn bị môi trường theo skill `extension-puppeteer-debugging`: Edge executable,
Puppeteer và FFmpeg cho video mẫu; nếu khác máy cũ thì đặt
`VOCAB_PUPPETEER_MODULE`, `VOCAB_BROWSER`, `STUDY_FFMPEG` theo script. Dependency
harness trong `.codex/` không được commit, nên checkout mới cần chuẩn bị lại.
Không coi thiếu môi trường là test đã đạt; không dùng profile/key thật để lấp
fixture. Các ca yêu cầu tài khoản/video live ghi riêng kết quả thực tế.

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

## Mẫu báo cáo cho mỗi lần nâng cấp

```markdown
# Nâng cấp upstream <tag> → local <version>A

- Local bắt đầu: <SHA/branch>; upstream cũ: <tag/SHA>.
- Upstream mới: <tag/SHA đã xác minh>; merge/source cuối: <SHA/branch>.
- Package / manifest numeric / version_name: <...>.

| Commit/feature/fix upstream | Nhóm F | Nhận / điều chỉnh / bỏ qua / chưa port | Lý do và test |
| --------------------------- | ------ | -------------------------------------- | ------------- |
| ...                         | ...    | ...                                    | ...           |

## Đã sửa

<Chức năng mới/fix đã nhận; cách port các nhóm F bị ảnh hưởng; thay đổi dữ liệu.>

## Đã kiểm thử

<Lệnh/exit code, unit/lint/build, update cùngID, browser/version, fixture hay live.
Schema/DB/ZIP/transport trước → sau; credential và dữ liệu học giữ nguyên ra sao.>

## Chưa kiểm thử

<Live sites/API/cloud hai máy/thiết bị thật hoặc giới hạn môi trường; không suy diễn.>

## Bị chặn

<Mục chưa port và điều kiện cần; ghi Không nếu không còn blocker triển khai.>

## Bàn giao

<Một ZIP có manifest ở root, byte count/SHA-256/CRC, commit/branch.
HTML mới nếu cần; cập nhật docs F/guide và hướng dẫn ghi đè cùng thư mục rồi Reload.>
```

## Nội dung có thể gửi cho agent ở lần sau

> Nâng cấp bản local này lên tag upstream `<tag tôi chọn>`. Đọc AGENTS.md,
> FORK_DIFFERENCES.md và UPSTREAM_UPGRADE_GUIDE.md trước. Bắt đầu từ nhánh local
> mới nhất, lập bảng nhận/điều chỉnh/bỏ qua từng nhóm thay đổi upstream và giữ
> các hành vi F01–F22, dữ liệu và định dạng đã phát hành. Nhận tính năng mới và
> bug fix phù hợp; chuyển phần dịch vụ về runtime riêng khi cần, không thay
> toàn bộ source bằng upstream. Kiểm migration/import/export, production và
> update cùng ID. Cập nhật tài liệu, commit/push nhánh riêng và giao một ZIP;
> báo rõ đã sửa, đã kiểm thử, chưa kiểm thử và bị chặn.

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
