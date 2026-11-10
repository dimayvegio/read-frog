# Bản local khác upstream ở đâu?

Tài liệu đối chiếu để nâng cấp tiếp mà giữ các chức năng đã phát triển riêng.
Đọc cùng [hướng dẫn merge](UPSTREAM_UPGRADE_GUIDE.md) và [AGENTS.md](AGENTS.md).

## Mốc tích hợp hiện tại: 1.58.1A

- Upstream release mới nhất đã xác minh 09/11/2026: `v1.58.1`,
  `8f015c4a830951dd98fd836989e7348849e60cea`.
- Local trước merge: `6bb2038a` (đã gồm F23), nhánh nhận
  `codex/upstream-1.58.1-openai`; package `1.58.1-a.1`, manifest `1.58.1.1`.
- Nhận cả ba patch menu placement, stable subtitle cache và stale-host cleanup;
  giữ mọi F01–F23, geometry Learning và runtime OpenAI-only. Không đổi config124,
  credential DB1 hoặc DB/ZIP/report/transport đã phát hành.
- Commit merge: `74e721a9c110526d17e7d8a3aa3e28644b1b18d7`.
- Quyết định từng commit, kiểm thử và giới hạn:
  [UPSTREAM_1_58_1_REPORT.md](UPSTREAM_1_58_1_REPORT.md).
- Các bảng kiểm toán 1.58.0 bên dưới là snapshot lịch sử, không phải tag mới nhất.

**F23 — Audio → Văn bản:** thêm từ baseline local `1ea3c17e`. Trang riêng tải
file đa ngôn ngữ; thu tab chạy nền với hai chế độ thu trước/chép lời trực tiếp.
File dùng `gpt-transcribe`, live dùng `gpt-live-transcribe` qua WebRTC; giữ key
riêng, opt-in và partial/final đúng trạng thái. Audio/text ở RAM, không đổi
schema cũ, không tự thay track CC hoặc upload microphone. Khi nâng upstream,
giữ source ownership, cleanup, TTS chung offscreen và các tests trong
[AUDIO_TRANSCRIPTION.md](AUDIO_TRANSCRIPTION.md).
F23 mở rộng ở package `1.58.1-a.2` / manifest `1.58.1.2` từ HEAD `7ecdd82d`:
YouTube tự hiện khung chép lời trực tiếp có kéo/resize/thu gọn/fullscreen,
bản gốc tạm/final và dịch ngữ cảnh theo lựa chọn ngôn ngữ. Dùng chung capture,
không sửa native CC/Learning; key/model qua private runtime, bounded RAM,
không đổi config/DB/ZIP. Hợp đồng và tham khảo mã nguồn mở trong
[AUDIO_TRANSCRIPTION.md](AUDIO_TRANSCRIPTION.md).

F23 từ package `1.58.1-a.3` / manifest `1.58.1.3` (baseline `05aced5b`)
mở khung live sang các trang HTTP/HTTPS và file có quyền content script,
không giới hạn YouTube. Giữ đúng source URL/tab/top-frame, lazy-load view
khi dùng, probe tối đa 3 giây và fallback Audio nếu trang không chèn được UI.
Nguồn có khung dùng cap 6s; không đổi model/credentials/config/DB/ZIP.

F23 từ package `1.58.1-a.4` / manifest `1.58.1.4` (baseline `c0fb01a3`):
khung nguồn ghim mặc định trong phiên, phục hồi cùng host khi ứng dụng gỡ DOM,
giữ nhãn dừng khi phiên kết thúc và xóa lời khi source URL đổi. Audio có cửa
sổ nổi Document PiP từ chính owner, không tạo capture/AI job thứ hai. File có
chế độ SRT opt-in dùng timestamp segment API `whisper-1` (legacy, dự kiến dừng
26/02/2027); text/live vẫn model cũ. Giữ private credential/sender/epoch guards,
RAM bounds, không timing giả/paid repair và không đổi config/DB/format cũ.
Xem hợp đồng và giới hạn kiểm thử trong [AUDIO_TRANSCRIPTION.md](AUDIO_TRANSCRIPTION.md).

F23 từ build `1.58.1-a.5` / manifest `1.58.1.5` sửa bật dịch live
sau điều hướng SPA: xác thực current top-frame URL/documentId từ browser, không
dựa riêng vào MessageSender.url có thể cũ. Giữ exact route, reject stale async
ownership và mọi bounds/cache/cleanup F23; không thay model hoặc schema.

Các mã F01–F18 là danh mục hành vi cần bảo toàn, không phải danh sách
file phải giữ nguyên. Có thể nhận cách triển khai tốt hơn từ upstream nếu vẫn
đáp ứng hành vi, dữ liệu và kiểm thử tương ứng.

**F19 — Luyện nghe và thư viện đoạn đọc:** thêm từ release `1.58.0-a.21` /
manifest `1.58.0.22` trên HEAD `9ad04eec`: nghe nguồn–dịch theo cặp câu, lặp/
khoảng nghỉ, MP3 xen kẽ, thư mục/tìm kiếm/yêu thích, ZIP thư viện và thu giọng
shadowing local. Đây là phần bổ sung sau danh mục F01–F18 của snapshot lịch sử;
phải giữ khi merge. DB riêng `read-frog-reading-library` v1, ZIP
`read-frog-reading-library` v1; không đổi các DB/config/ZIP cũ. Quy tắc và
source/regression tại [READING_LAB.md](READING_LAB.md).

**F20 — PDF song ngữ theo đoạn:** thêm từ release `1.58.0-a.22` / manifest
`1.58.0.23`, trên baseline `3c53f11d`. Trình đọc PDF.js có bản gốc/bản dịch hai
khung, badge và highlight tương ứng, cuộn liên kết; dịch từng đoạn/trang theo
thao tác rõ ràng. Dùng cache/epoch/credential identity PDF cũ, không đổi DB2.
Giữ không gọi provider khi mở/cuộn/cache miss, hủy khi chuyển trang/file và
giới hạn tài nguyên. Hợp đồng, source và regression:
[PDF_BILINGUAL_READING.md](PDF_BILINGUAL_READING.md).

**F21 — Khung song ngữ HTML cùng Translate page:** release `1.58.0-a.23` /
manifest `1.58.0.24`, trên baseline `c7f863f7`. Khung main-frame đọc các cặp
do engine commit ở cả bilingual và translation-only; không dịch lần hai,
không thêm cache/DB. Có highlight/cuộn liên kết, reserve/minimize/close và
controls TTS/MP3/thư viện cho đoạn đang chọn. Giữ weak bounded metadata,
source/parent/route/restore guards và regression:
[HTML_BILINGUAL_READING.md](HTML_BILINGUAL_READING.md).

**F22 — Luyện phát âm Mỹ:** release `1.58.0-a.24` / manifest `1.58.0.25`, trên
baseline `117c7d85`. Translate/Dictionary mở khung thu/nghe/chấm explicit bằng
OpenAI audio; rubric cố định, điểm 0–10 bước 0,5, lỗi/cách sửa/thử lại và báo cáo
tiến trình. DB pronunciation v1 riêng, không lưu audio, không sửa SRS/config sync
hoặc upload bản shadowing F19. Hợp đồng, giới hạn và regression:
[AMERICAN_PRONUNCIATION.md](AMERICAN_PRONUNCIATION.md).

F22 sửa chấm **từ riêng lẻ** ở package `1.58.0-a.25` / manifest `1.58.0.26`
(baseline `f7e4fbb0`): prompt 3 tiêu chí, adapter response v2 cho N/A/JSON/score,
giữ unscored retry khi chưa nghe đủ rõ và mã chẩn đoán an toàn riêng cho lỗi
định dạng. Không đổi model `gpt-audio-1.5`, rubric/DB/report hoặc engine dịch.

F22 từ package `1.58.0-a.26` / manifest `1.58.0.27` mở **tab Phát âm** thông
thường và có menu launcher. Thêm tự dừng local sau khi nói rồi im lặng khoảng
1,5 giây (có thể tắt), giữ Dừng tay/30 giây, không tự gửi chấm. Detector dùng
chung mic stream và dọn graph/track/timer khi dừng/đóng; F19 không bật tự dừng
mặc định. Không đổi dữ liệu và giữ adapter sửa lỗi từ đơn.

## Mốc đối chiếu đã xác minh ngày 07/11/2026

**Bổ sung sau mốc kiểm toán:** release `1.58.0-a.19` / manifest `1.58.0.20`
(vẫn hiển thị `1.58.0A`), phát triển trên HEAD `816c12b5`, mở rộng **F09** bằng
nút tải MP3 OpenAI toàn đoạn. Giữ cache chung, export cancellation độc lập,
không đổi model hoặc dữ liệu đã phát hành. Source, giới hạn và regression nằm
trong [OPENAI_TTS_DOWNLOAD.md](OPENAI_TTS_DOWNLOAD.md). Bảng mốc/audit bên dưới
vẫn mô tả snapshot `7ccf0ad7`; khi nâng cấp cần bao gồm cả bổ sung này và các
commit mới hơn trên nhánh hiện hành.

Release `1.58.0-a.20` / manifest `1.58.0.21` tiếp tục F09: popup dịch/custom
action mở rộng phần văn bản gốc mặc định để hiện ngay Copy, loa và MP3; người
dùng vẫn thu gọn được. Không tự phát hoặc tải audio chỉ vì mở popup.

| Mục                       | Giá trị                                                        |
| ------------------------- | -------------------------------------------------------------- |
| Repo gốc                  | `https://github.com/mengxi-ream/read-frog.git`                 |
| Tag gốc đã tích hợp       | `v1.58.0`                                                      |
| SHA tag gốc               | `48dccd04cfdf8432994608215ccad6db329f952b`                     |
| Commit merge vào fork     | `c9505fad88f2d4d675f397a57aa39fc4ca378c0d`                     |
| Repo local                | `https://github.com/dimayvegio/read-frog.git`                  |
| Nhánh source hiện dùng    | `codex/pdf-reading-panel`                                      |
| Mốc source được kiểm toán | `7ccf0ad7c6ff62a6551485eefe45e852bca087da`                     |
| Release local             | `1.58.0A`; package `1.58.0-a.18`; manifest numeric `1.58.0.19` |
| Config schema             | Fork `124`; upstream tại tag này là `121`                      |

Commit upstream trên là tổ tiên của mốc source local. Merge `c9505fad` có hai
parent: `d2e7656e...` của fork và `48dccd04...` của upstream. Lần nâng cấp sau
phải bắt đầu từ **nhánh local mới nhất**, không checkout source tag gốc rồi
chép lại vài tính năng. Mốc kiểm toán này giữ nguyên để các lệnh tái lập không
bị trôi khi thêm commit tài liệu hoặc tiếp tục phát triển.

```powershell
git rev-parse 'v1.58.0^{commit}'
git show -s --format='%H %P %s' c9505fad
git merge-base 7ccf0ad7 48dccd04
git diff --shortstat 48dccd04 7ccf0ad7
git diff --name-status 48dccd04 7ccf0ad7
```

Kết quả đối chiếu cây source: **784 file thay đổi, 35.573 dòng thêm, 53.190
dòng xóa**. Số này gồm dịch vụ bị gỡ, tests, tài liệu và tài nguyên; không phải
phép đo hiệu năng hay số lượng tính năng mới.

## Ma trận upstream → local → cách giữ khi nâng cấp

| ID  | Upstream tại `v1.58.0`                                                                                                                  | Bản local hiện tại                                                                                                                                                          | Quyết định khi nhận bản mới                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 | Nhiều provider, Built-in/hosted AI, auth, quota và dịch vụ Read Frog                                                                    | Runtime dịch/phân tích dùng OpenAI chính thức qua background; bỏ các luồng hosted, login, billing, telemetry, proxy tổng quát                                               | Nhận fix engine/site, chuyển phần gọi AI sang runtime riêng. Không kéo lại các dịch vụ đã gỡ để làm UI upstream chạy được                                                                                                                    |
| F02 | Provider/config và import/export theo kiến trúc gốc                                                                                     | Key nằm trong DB riêng; public config, backup/export không chứa key; chỉ trang settings được thay/xóa; tombstone và recovery/bootstrap                                      | Giữ key khi update cùng ID. Import/reset không kích hoạt key từ file cũ; giữ sender guards, queue ghi config và các bước migration đã phát hành                                                                                              |
| F03 | Engine DOM/HTML, bilingual/translation-only, inline atoms/toán, glossary, queue/batch/cache, streaming và selection popover có ghim/kéo | Giữ engine và hành vi đó, dùng OpenAI riêng; thêm các tích hợp local ở phía UI/runtime                                                                                      | Đây là phần kế thừa cần tiếp tục nhận bug fix. Không chọn nguyên file `ours` chỉ vì file chứa thay đổi local; giữ sanitizer, restore DOM/font, streaming và cancellation                                                                     |
| F04 | YouTube CC native, logo/menu/style, transcript, tải phụ đề; look-ahead dịch30s, xử lý60s, batch5                                        | Giữ UI/CC gốc; tăng dịch trước lên120s ở1×, điều chỉnh theo playback rate đến hệ số4; giữ processing chunk60s/batch5                                                        | Giữ horizon120s và admission của segmentation; nhận fix tải track/SPA/player. Không biến bật dịch thành gửi toàn bộ video một lượt                                                                                                           |
| F05 | Có AI smart segmentation tùy chọn dành cho hiển thị phụ đề                                                                              | Thêm **Luyện nghe từng câu** riêng, opt-in theo video; OpenAI chọn chỉ số ranh giới trên CC native; giữ câu ngắn, không giới hạn15 từ; J/K/L, lặp1–3, tự dừng, ẩn/hiện dịch | Giữ track luyện nghe riêng với display optimizer/translation. Window120s/600 từ/24.000 ký tự, carry câu cuối, cache riêng theo prompt/profile/credential; hủy khi tắt/đổi video/CC/ad. Mốc bên trong CC thiếu word timing phải báo ước lượng |
| F06 | Sidebar Learning cố định bên phải, rộng400px/gần toàn chiều cao                                                                         | Thêm kéo cả khung, resize8 cạnh/góc, bàn phím/reset, nhớ local, clamp viewport và theo fullscreen                                                                           | Không remount transcript hay đổi playback khi kéo; giữ pointer capture/primary guard, dọn listeners/rAF và chống storage đọc muộn. Geometry không vào config sync                                                                            |
| F07 | Chưa có adapter ani.pm trong tag đối chiếu                                                                                              | Thêm ani.pm/Settlar, logo/menu cạnh CC và tự đóng menu khi bật                                                                                                              | Giữ exact iframe/hostname/path guard; đọc cue player đã tải, không đổi mode track disabled hoặc can thiệp player/quảng cáo. Guard YouTube phải loại iframe Settlar                                                                           |
| F08 | Có X/Twitter, Netflix, Bilibili, Udemy/Business và edX native captions                                                                  | Nhận Bilibili/Udemy/edX từ tag; khôi phục X/Netflix từ đúng tag sau khi bản fork đầu đã gỡ; dịch bằng OpenAI riêng                                                          | Các site này là năng lực kế thừa/khôi phục, không phải đều do fork phát minh. Giữ Netflix MAIN bridge/track restore và X native TextTrack; nhận fix adapter mới mà không phục hồi hosted ASR                                                 |
| F09 | Microsoft TTS và offscreen playback                                                                                                     | Giữ Microsoft; thêm OpenAI TTS, model/voice/speed/style, cache, Stop/cancel và đọc thử bằng credential riêng                                                                | Giữ hai lựa chọn, cài đặt Microsoft và đường playback; việc sinh audio sổ từ có cancellation độc lập. Không tự đổi dịch vụ hoặc model sau update                                                                                             |
| F10 | Chưa có các entrypoint local `selection-result`/`pdf-reader` của fork                                                                   | Dịch selection từ Edge PDF, guest tab thiếu ID/`-1`; khung cố định + popup fallback; PDF.js local tự lưu trang/scroll/zoom theo hash; history/cache riêng tài liệu          | Giữ user gesture trước await, channel ngẫu nhiên, không đưa text/path vào URL/provider; worker/assets local và tối đa3 canvas. Vị trí tự lưu thuộc reader Read Frog, không hứa theo dõi trang cuộn của Edge native                           |
| F11 | Chưa có image editor/capture/OCR flow của fork                                                                                          | Chụp/crop/paste/mở ảnh; OCR + dịch hai bước hoặc structured một lượt; sửa chữ, cache/force-read/regenerate; Alt+Shift+S cấu hình được; sửa đích ngôn ngữ với prompt riêng   | Chỉ crop đi qua private runtime, ảnh ở RAM; cache không chứa ảnh. Giữ clear epoch, cache OCR/fast/text riêng, fingerprint và target code rõ ràng; glossary/prompt riêng dùng hai bước                                                        |
| F12 | Có hệ tài khoản/Notebase/flashcard và Google Drive của upstream                                                                         | Thay bằng sổ từ local có tên/ID riêng, OpenAI tạo nghĩa/IPA/ví dụ/audio, ZIP theo sổ và HTML ôn từ độc lập dùng được trên phone                                             | Không nhận lại Notebase/cloud auth như dependency của nút lưu từ. Giữ card/notebook IDs, nhiều sổ, MP3/WAV, DEFLATE, reader ZIP1–6 và HTML tự chạy trên file URL/HTTP(S)                                                                     |
| F13 | Luồng học và dữ liệu theo hệ gốc                                                                                                        | Logs từng từ, đáp án đầu tiên, SRS và assisted/unassisted riêng; guided typing/correction/hints/dictation/cloze, buổi học dở; Markdown/JSON cho ChatGPT                     | Giữ evidence/event IDs qua import, không double count, không dựng logs từ counter lịch cũ. Flashcard tự chấm không trở thành objective accuracy; một lần đúng không được suy ra thuộc                                                        |
| F14 | Các luồng note/annotation và nguồn theo hệ gốc                                                                                          | Tô từ của sổ đang chọn trên web/PDF.js/subtitles theo bằng chứng học; tra nghĩa local trước; nhiều câu nguồn/timestamp/page cho mỗi từ                                      | Giữ CSS Highlights không thay DOM text, scan bounded; source attach không tạo lại audio/đổi SRS. Tách nguồn câu với review events; PDF jump đúng document hash/trang                                                                         |
| F15 | Telemetry và các dịch vụ/usage theo hệ gốc                                                                                              | Dashboard usage local: token SDK thật, cache riêng, latency, ước tính phí/giá riêng/cảnh báo ngân sách/exportJSON                                                           | Không gửi analytics hoặc lưu prompt/URL/key vào usage DB. Model/usage chưa đủ dữ liệu phải để chưa định giá; mock không được báo là tốc độ/chi phí model live                                                                                |
| F16 | Google Drive sync và Send feedback cũ                                                                                                   | Gỡ feedback; thêm **Edge native configuration sync** opt-in, gzip/chunks, vector conflicts, undo/recovery; không cần Client ID                                              | Giữ transport1/config124 đã phát hành. Không sync key, sổ từ/audio/logs hay các DB khác; cùng extension ID. Storage.sync nhận ghi không chứng minh Microsoft cloud đã chuyển sang máy khác                                                   |
| F17 | Font, thứ tự ngôn ngữ và prompt/caches theo gốc                                                                                         | Font dịch tiếng Việt không tách dấu trên Windows; English/Vietnamese đứng đầu bộ chọn chung; ảnh/PDF ưu tiên đích đã chọn dù prompt ghi cứng ngôn ngữ khác                  | Giữ typography cả bilingual/translation-only và restore khi tắt. Giữ template/style/glossary của người dùng; cache cần xét đích rõ ràng, không dùng lại bản sai ngôn ngữ                                                                     |
| F18 | Quy trình đóng gói/phụ thuộc và version của upstream                                                                                    | Build Edge độc lập, tài nguyên UI local; hiển thị hậu tốA; giao một ZIP cài đè cùng thư mục/ID                                                                              | Giữ version numeric hợp lệ, không thêm manifest key âm thầm. Không giao source ZIP/CRX/key/profile; kiểm CRC/manifest/từng file và tạo lại HTML ôn từ khi build                                                                              |

**Đã có sẵn upstream:** ghim/kéo popup dịch vùng chọn, sidebar transcript,
optional AI display segmentation, nhiều style phụ đề và các site trong F08.
Phần mới của fork là những điều chỉnh/tích hợp ghi ở cột local. Đừng dùng tên
feature trùng nhau để xóa track học/DB sổ từ local rồi thay bằng cloud upstream.

## Bản đồ source và tài liệu cần đọc khi có conflict

| Nhóm     | Điểm vào source hiện tại                                                                                                                                                                                         | Tài liệu/test cần đối chiếu                                                                                                                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F01–F02  | `src/types/config/openai.ts`; `src/entrypoints/background/{openai-runtime,openai-credentials,openai-settings,background-stream,config-bootstrap,settings-sender}.ts`; `src/utils/config/{portable,migration}.ts` | Các test credentials/bootstrap/runtime, config/import/export; migration121–124 và fixtures                                                                                                                   |
| F03, F17 | `src/utils/host/translate/`; `src/utils/glossary/`; `src/assets/styles/translation-node-preset.css`; `src/utils/prompts/native-translate.ts`; `src/components/language-combobox-options.ts`                      | Tests DOM/inline atoms/restore/glossary; `src/utils/selection-result/__tests__/translate.test.ts`; thứ tự ngôn ngữ dùng chung                                                                                |
| F04–F08  | `src/entrypoints/subtitles.content/`; `src/utils/subtitles/`; `src/entrypoints/interceptor.content/`; `src/entrypoints/netflix-interceptor.content/`                                                             | [STUDY_FLOW_AND_USAGE.md](STUDY_FLOW_AND_USAGE.md), [ANI_PM_SUBTITLES.md](ANI_PM_SUBTITLES.md), [X_NETFLIX_SUBTITLES.md](X_NETFLIX_SUBTITLES.md); coordinator/pipeline/adapter/fetcher/learning/window tests |
| F09      | `src/entrypoints/background/{edge-tts,openai-tts,tts-playback,tts-request}.ts`; `src/hooks/use-text-to-speech.tsx`; `src/entrypoints/options/pages/text-to-speech/`                                              | OpenAI TTS/private runtime/playback/cancel tests; phần TTS trong [README](README.md#đọc-thành-tiếng)                                                                                                         |
| F10      | `src/entrypoints/{pdf-reader,selection-result}/`; background `native-selection.ts`, `native-panel.ts`, `pdf-reader.ts`, `context-menu.ts`; `src/utils/selection-result/`                                         | [PDF_LOCAL_READING.md](PDF_LOCAL_READING.md); native guest-tab/context-menu/reader/history/epoch tests                                                                                                       |
| F11      | `src/entrypoints/image-translate/`; `src/entrypoints/background/image-translation.ts`; `src/utils/image-translation/`; `src/types/image-translation.ts`                                                          | [IMAGE_TRANSLATION.md](IMAGE_TRANSLATION.md); image sender/cache/recognize, native target-language tests                                                                                                     |
| F12–F14  | `src/utils/vocabulary/`; `src/entrypoints/vocabulary/`; `src/entrypoints/background/vocabulary.ts`; `src/components/ui/selection-popover/save-vocabulary-button.tsx`; `scripts/build-vocabulary-review.mjs`      | [VOCABULARY_LEARNING.md](VOCABULARY_LEARNING.md), [STUDY_FLOW_AND_USAGE.md](STUDY_FLOW_AND_USAGE.md); migration/archive/review/guided/sources/scale                                                          |
| F15      | `src/utils/usage/`; `src/entrypoints/background/usage.ts`; `src/entrypoints/usage/`                                                                                                                              | [STUDY_FLOW_AND_USAGE.md](STUDY_FLOW_AND_USAGE.md); SDK usage middleware/cancel/cache/pricing/clear epoch                                                                                                    |
| F16      | `src/utils/settings-sync/`; `src/entrypoints/background/settings-sync.ts`; `src/entrypoints/settings-sync/`                                                                                                      | [EDGE_SETTINGS_SYNC.md](EDGE_SETTINGS_SYNC.md); checksum/head-last/vector/conflict/recovery/sender tests                                                                                                     |
| F18      | `wxt.config.ts`; `package.json`; `pnpm-lock.yaml`; `src/env/`; `public/`; build scripts                                                                                                                          | Build/asset/manifest review; package numeric version và ZIP/root entries                                                                                                                                     |

Các nhóm đường dẫn trong `{...}` là ký hiệu gọn, không phải một tên file.
Nếu upstream chuyển file, tìm implementation mới rồi nối lại hợp đồng hành vi;
không tạo hai controller/bridge trùng nhau chỉ để giữ tên đường dẫn cũ.

## Dữ liệu và định dạng đã phát hành

| Kho/hợp đồng                         | Phiên bản tại mốc đối chiếu                             | Điều phải giữ                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Public config                        | Fork124                                                 | Migration liên tục, portable projector và write queue; không mang key/hosted provider trở lại                                      |
| Credential `edge-openai-credentials` | DB1; journalID `config-v121` vẫn được dùng              | Giữ tên DB/origin, tombstone, recovery và journal; không đổi journalID chỉ vì schema đã lên124                                     |
| `AppDB` dùng chung                   | DB6                                                     | Giữ glossary/terms và các schema đã phát hành; phân biệt cache xóa được với glossary của người dùng                                |
| `read-frog-pdf-reading`              | DB2                                                     | History/cache + position/epoch; DB1 và DB2 đóng băng, thay đổi mới thêm version mới                                                |
| `read-frog-image-cache`              | DB1                                                     | Chỉ hash/chữ/bản dịch, giới hạn và epoch; không thêm ảnh hoặc credential vào record                                                |
| `read-frog-vocabulary`               | DB5                                                     | Giữ DB1–5 và frozen v1→v2 migration; source/review/audio/progress IDs không bị tạo lại khi upgrade                                 |
| Notebook archive                     | WriterZIP6, đọcZIP1–6                                   | Giữ legacy readers, CRC/hash/size limits, MP3/WAV và dữ liệu sổ/tiến trình/nguồn                                                   |
| Review report                        | JSON3 và Markdown                                       | Phân biệt câu trả lời, assisted, self-rating, unassessed; không suy diễn lịch sử                                                   |
| `read-frog-api-usage`                | DB1                                                     | Số liệu/task/model, bounded storage và clear epoch, không text/key/URL                                                             |
| `read-frog-settings-sync`            | DB1; transport1 `read-frog-edge-settings` cho config124 | Gzip/chunks/checksum/vector/recovery; config schema mới cần transport reader/writer mới, không project bỏ field chưa hiểu rồi sync |
| Learning geometry                    | Local key `subtitlesSidebarWindowV1`, payload1          | Chỉ rect, device-local; reset riêng, không thêm vào frozen transport1                                                              |

**Xung đột số migration đã biết:** upstream120→121 thêm Bilibili/Udemy/edX;
fork120→121 là OpenAI-only/credential separation, 121→122 là OpenAI TTS,
122→123 mới nhận các platform đó và 123→124 thêm ani.pm. Không chép file
upstream trùng số đè các snapshot đã chạy. Bước fork kế tiếp bắt đầu124→125
**nếu bản nâng cấp thực sự cần đổi config**; các DB và ZIP có số riêng.

## Mốc commit giúp truy lại ý định

| Commit                             | Thay đổi riêng hoặc tích hợp cần giữ                          |
| ---------------------------------- | ------------------------------------------------------------- |
| `76eaa563`                         | OpenAI-only, credential riêng, UI/engine CC YouTube gốc       |
| `bb210766`, `c8295186`             | PDF selection và guest-tab lifecycle                          |
| `59aa5d82`                         | OpenAI TTS song song Microsoft                                |
| `3530c9db`, `d2e7656e`             | Typography tiếng Việt và buffer120s                           |
| `c9505fad`                         | Merge upstream1.58.0, port migration platform thành schema123 |
| `4b48768a`, `c1ef4a28`             | ani.pm, iframe guard và menu tự đóng                          |
| `cb6a3cc9`                         | Khôi phục X/Netflix native từ đúng tag1.58.0                  |
| `d9504205`, `2d9c8dfa`, `5d25ccd9` | Vocabulary/HTML, nhiều sổ, MP3/ZIP3                           |
| `5734cb32`, `c46ea0ba`, `9e2a8724` | Logs/report, phân nhóm từ cần ôn, guided learning/ZIP5        |
| `f823d780`, `83b1e454`             | PDF panel/history và PDF.js autosave                          |
| `f4737d6c`, `b8c9de2f`             | Image OCR/crop, fast/cache/shortcut                           |
| `2b484d4e`, `7cbdc3ce`             | Ngôn ngữ ưu tiên, highlights/sources/usage, luyện câu ban đầu |
| `014b6ef2`                         | Edge sync, gỡ feedback                                        |
| `54944f22`, `7f409dd7`             | AI listening sentence track; đích ngôn ngữ/cache ảnh/PDF      |
| `7ccf0ad7`                         | Learning window kéo/resize/keyboard/persistence/fullscreen    |

## Những giới hạn không được viết thành tính năng đã có

- F23 có chép lời từ âm thanh tab kể cả thiếu CC, nhưng chưa tạo track phụ đề
  overlay/SRT đồng bộ với timeline video. Không tự thu hoặc gọi hosted ASR
  upstream; OCR ảnh thủ công là luồng khác.
- Native Edge PDF chỉ lấy vùng chọn khi file có text copy được; PDF scan dùng
  crop/OCR hoặc reader Read Frog. Autosave vị trí chỉ có trong reader riêng.
- Ghim popup web không phải Windows always-on-top. Learning frame nằm trong
  trang/fullscreen player, không phải cửa sổ nổi trên mọi ứng dụng.
- Edge sync hiện chỉ chuyển config nhỏ/cờ highlight, chưa chuyển sổ từ/audio,
  API key, glossary rows, PDF/image/usage DB hoặc geometry. Chưa có OAuth trực
  tiếp Drive/OneDrive cho bản này.
- Ở bản source này, AI sentence hiện trong khung Learning; overlay/transcript
  thường vẫn dùng track phụ đề riêng. Timing nội suy không phải forced alignment
  từ audio. Bật Learning tab đơn thuần chưa gọi AI chia câu.
- Những kết quả4212 unit tests/59 Edge assertions của releasea.18 là bằng
  chứng đã ghi trong [STUDY_FLOW_AND_USAGE.md](STUDY_FLOW_AND_USAGE.md), không tự
  trở thành bằng chứng cho lần merge tiếp. Site live, Microsoft cloud hai máy,
  API OpenAI thật, điện thoại thật và tốc độ model cần báo riêng theo lần thử.

Sau mỗi nâng cấp, cập nhật mốc source/tag/version, các hàng F bị ảnh hưởng,
ledger dữ liệu và link kết quả kiểm thử. Mẫu báo cáo nhận/điều chỉnh/bỏ qua
upstream và điều kiện bàn giao nằm trong [UPSTREAM_UPGRADE_GUIDE.md](UPSTREAM_UPGRADE_GUIDE.md).
