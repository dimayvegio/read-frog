# F23 — Audio thành văn bản và chép lời tab trực tiếp

**Kiểm tra khi nâng upstream1.59.1 (11/11/2026):** đã đối chiếu lại
[OpenAI deprecations](https://developers.openai.com/api/docs/deprecations) và
[file transcription](https://developers.openai.com/api/docs/guides/speech-to-text).
Mốc shutdown `whisper-1` vẫn là **26/02/2027**; timed SRT legacy tiếp tục explicit,
chỉ dùng segment timestamps API đã validate. Đợt này không đổi model Audio,
không tự đổi chế độ hoặc sinh timestamp từ plaintext. Các default text/live,
private endpoints, pin/recovery/ownership và RAM-only vẫn giữ riêng.

Phát triển từ local HEAD `1ea3c17e`, sau F22. Giữ toàn bộ engine dịch, các
DB/ZIP/config đã phát hành và Microsoft/OpenAI TTS. Đây là trang Audio riêng,
không thay track CC và không tự thu khi mở video. Từ build `1.58.1.2`,
phiên live được người dùng bật tại YouTube có khung chép lời riêng trên trang.

## Cách sử dụng

- Popup Read Frog → **Audio → Văn bản** mở tab bình thường. Chọn/thả file,
  nghe thử local, chọn ngôn ngữ và bấm chuyển. Từng file hoặc hàng đợi tuần tự;
  dừng/hủy, sửa chữ, Copy, TXT riêng và ZIP các TXT. Không tự gửi lại khi lỗi.
- Muốn nghe YouTube/video/MP3 đang phát: mở popup **tại tab nguồn**, vào Audio,
  chọn **Chép lời trực tiếp** hoặc **Thu trước, chuyển sau** rồi bắt đầu.
  Có thể chuyển tab/dùng máy tiếp. Giữ tab nguồn và trang Audio mở; đóng/tải lại
  Audio hoặc điều hướng tab nguồn sẽ dừng. Cần Chromium/Edge 116+.
- Chỉ thu tiếng phát ra từ tab; chưa thu micro, ứng dụng họp desktop hoặc âm
  thanh toàn máy. Trình duyệt/nội dung bảo vệ có thể không cho thu âm.
- Thu trước giữ WebM/Opus local, dừng rồi chọn chuyển file mới gửi OpenAI.
  Có nút tải bản thu WebM; không gọi nó là MP3. Trực tiếp gửi âm thanh liên tục
  sau thao tác bắt đầu rõ ràng, có chỉ báo thu và nút dừng.
- Bốn gợi ý mặc định: `en`, `zh`, `ja`, `vi`. Có preset Anh–Nhật,
  Anh–Nhật–Việt, Anh–Trung, tùy chọn tự nhận dạng và mã ISO khác. Nên chọn các
  ngôn ngữ thực sự dự kiến dùng; hint không ép hoặc dịch nội dung. Text giữ
  nguyên ngữ, kể cả đổi ngôn ngữ giữa câu. Không hứa độ chính xác khi chưa thử
  audio thật; live model không trả dự đoán ngôn ngữ nhận dạng.
- File/text chỉ ở RAM trong lượt đang mở; tải kết quả trước khi đóng. Từ build
  `1.58.1.4` có SRT theo segment khi chọn riêng chế độ phụ đề cho file. Chưa có
  transcript history, speaker labels, word timing hoặc SRT cho phiên live.

## Sửa mất khung nguồn và phục hồi giao diện — build 1.58.1.6

Baseline `8689671eb7366697acc0a316000f30afcdac549a`, cùng nhánh local và upstream
`v1.58.1`; package `1.58.1-a.6`, manifest numeric `1.58.1.6`, tên `1.58.1A`.

- **Đã sửa:** ảnh người dùng xác nhận ASR vẫn chạy nhưng source-view probe trả
  fallback. Luồng cũ phải qua shared content-runtime và dynamic import; khi
  module lỗi/không kịp load, giao diện chỉ báo dự phòng rồi không có cách mở
  lại khung. Chưa kết luận chính xác lỗi mạng/CSP/timing nào xảy ra trên Edge
  của người dùng; đây là đường lỗi được tái hiện có kiểm soát trong regression.
- Khung nay là **bundle riêng được background nạp trực tiếp vào isolated world**
  sau thao tác Audio rõ ràng. Không phụ thuộc module/locale/theme/query providers
  của giao diện chung. Bundle không chạy trên các trang chưa dùng Audio và
  không được thêm vào manifest content scripts. Chỉ inject fixed file thuộc
  extension, đúng source URL/top frame/documentId do browser xác nhận; không
  nhận URL/script từ caller và không thêm permission.
- Probe tối đa 3 giây, chỉ báo sẵn sàng sau khi host đã mount. Handshake riêng
  `renderTabAudioSourcePane` tránh listener probe cũ trả false thắng response.
  Một job injection đang chờ cho mỗi phiên; bấm thử lại không nhân đôi job đang
  treo. Kết quả trễ phải qua guards source/session/cancellation trước tác động.
- Trong Audio có **Mở lại khung trên trang đang nghe**, kèm build number và mã
  chẩn đoán an toàn `UI-LOAD-TIMEOUT`, `UI-LOAD-FAILED`, `UI-SOURCE-CHANGED`.
  RPC chỉ cho Audio owner top-frame của đúng phiên. Bật lại khung dùng luồng
  capture/WebRTC và transcript RAM hiện tại; không lấy stream ID, secret,
  offer hoặc trả phí ASR mới. Phiên đang chạy vẫn tính phí live như trước.
- Bản gốc/final/partial được giữ bounded ở source scope kể cả khi UI chưa
  nạp được, để phục hồi không mất lời trước đó. Sau khôi phục thành công, local
  turn cap chuyển từ fallback 15s sang 6s trên cùng stream. Không đổi model,
  không tự reconnect/retry provider hoặc gửi provisional speech để dịch.
- Reinject cùng build là idempotent, mở lại khung đã có không remount React
  hoặc xóa bản dịch; giữ pin, fullscreen/click-through, scroll intent và geometry
  `liveTranscriptWindowV1`. Lightweight shadow host giữ dấu loại khỏi engine
  dịch trang và cleanup React/styles/listeners như trước. Context invalidate
  dọn host; vẫn hủy capture khi nguồn/owner đóng hoặc điều hướng.
- **Đã kiểm thử:** 4.370 unit tests pass, 1 skipped (loại free API theo
  `SKIP_FREE_API=true`); tests riêng kiểm fixed injection, document targeting,
  sai URL/owner/frame/session, pending-job dedup, timeout 3s, late cancellation
  và phục hồi final/partial không khởi động capture/provider khác. Production
  Chrome fixture chặn **request content-runtime thật**, cố ý làm lần nạp view
  đầu thất bại, rồi phục hồi hai lần: cùng host/session, chỉ một secret/RTC.
  Đồng thời kiểm dịch ngữ cảnh/đổi đích/cache, fullscreen/di chuyển/resize,
  silence, cap 6s, SRT, PiP và cleanup khi đóng/reload.
  Chrome `157.0.8103.40` đạt **136 checks**: 56 Facebook lỗi-nạp/phục-hồi,
  56 YouTube/SRT/PiP và 24 cập nhật cùng thư mục từ `1.58.1.5`, giữ ID/config/
  private key. Type-aware lint, format, build và kiểm CRC/từng entry ZIP pass.
- **Chưa kiểm thử:** Facebook/Teams đăng nhập và OpenAI thật trong profile Edge
  của người dùng. Browser fixtures dùng actual tab capture/WebRTC peer local,
  âm thanh tổng hợp và API mock; không chứng minh chất lượng hoặc latency thật.
- **Bị chặn:** lượt kiểm tra trực tiếp trước bị Computer Use dừng vì không xác
  nhận được URL Edge đủ chắc chắn. Không dùng đường khác để điều khiển profile
  đó; bằng chứng tự động hiện là Chrome profile kiểm thử độc lập.

Regression: `AUDIO_FACEBOOK=1 AUDIO_SPA_SOURCE=1 AUDIO_BLOCK_CONTENT_RUNTIME=1
AUDIO_VIEW_RECOVERY=1`; YouTube + `AUDIO_PIN_SRT=1`; cập nhật cùng thư mục bằng
`AUDIO_UPGRADE_FROM=<ZIP build 1.58.1.5>`. Không đổi config/DB/ZIP/report/sync
đã phát hành; private credentials, TTS, native CC và Learning vẫn độc lập.

ZIP: 456 file, 9.132.397 byte; bundle view riêng 363.577 byte và không có dynamic
import. ZIP tăng 104.922 byte so với build 1.58.1.5; không thêm mã chạy trên mọi
trang. SHA-256 `5adabb7a1ead592653217a6dbdd7ec0788bdb3dce8c282b91f0666aa0dfcfcef`.
Manifest không key; standalone vocabulary review giữ hash cũ.

## Sửa bật dịch sau điều hướng nội bộ — build 1.58.1.5

Baseline local `a4a2afae39a565556e4cb8dea5cea5b246cc8a1a`, nhánh
`codex/upstream-1.58.1-openai`; package `1.58.1-a.5`, manifest `1.58.1.5`,
tên cài `1.58.1A`. Upstream vẫn `v1.58.1`, không thay đổi model, config,
permission hoặc các schema đã phát hành.

- **Đã sửa:** nút **Dịch theo ngữ cảnh** bị từ chối nhầm trên trang SPA như
  Facebook. Tái hiện bằng production build cũ: sau `history.pushState` trước
  khi mở phiên Audio, `MessageSender.url` vẫn là URL lúc load document, còn
  source channel đã bind URL mới. Khung nhận lời bình thường nhưng bật dịch
  bị lỗi ownership, giống thông báo trong ảnh người dùng gửi.
- Background nay lấy current top frame bằng `webNavigation.getFrame`, so đúng
  URL nguồn và `documentId` do browser cung cấp với document gửi lệnh. Không
  dùng URL do caller tự khai, không nới sang cùng-origin hoặc mọi route. Nếu
  browser trả document IDs thì phải có cả hai và trùng; browser cũ không có IDs
  ở cả hai phía vẫn yêu cầu URL khớp tuyệt đối. Lookup lỗi, session bị đổi trong
  lúc await, sai tab/frame/document/route đều bị từ chối trước provider/stop.
- Áp dụng chung cho đọc snapshot, bật/tắt/đổi đích dịch, Dừng và mở Audio từ
  khung nguồn. Giữ hủy khi nguồn thay route/reload sau khi đã bắt đầu phiên,
  final-only opt-in, cache/queue/credential guards và không paid auto-retry.
  Thao tác bật dịch mới xóa cảnh báo UI cũ; lỗi mới vẫn báo rõ.
- **Đã kiểm thử:** unit checks cho URL ban đầu cũ nhưng current document hợp lệ,
  route/document ID sai, thiếu một ID, lookup thất bại và lookup trả sau khi
  session đã đổi. Production browser tái hiện lỗi trên build cũ rồi kiểm tra
  bản sửa với Facebook/YouTube origin fixtures có điều hướng SPA trước capture,
  actual tab capture/WebRTC peer local và provider mock. Kiểm bật dịch sau khi
  đã có lời, bật/tắt không dịch lại dữ liệu đã cache và đổi ngôn ngữ thực sự
  hoàn tất trước khi assert; không coi placeholder là bản dịch thành công.
  **4.366 unit tests pass, 1 skipped**; free API được loại theo
  `SKIP_FREE_API=true`. Chrome production `157.0.8103.40` đạt **122 checks**:
  50 Facebook SPA fixture, 48 YouTube SPA fixture và 24 cập nhật đè từ build
  `1.58.1.4` giữ ID/config/private key. Type-aware lint, format và ZIP build pass.
- **Chưa kiểm thử:** Facebook đăng nhập/Teams và OpenAI thật trong profile Edge
  người dùng. Fixture kiểm cơ chế browser và extension, không mô phỏng toàn bộ
  ứng dụng Facebook hay chất lượng model.
- **Bị chặn:** môi trường Edge kiểm thử trước đó thoát trước DevTools; dùng
  Chrome production profile riêng, không sửa policy/profile đang dùng.

Regression mới: `AUDIO_FACEBOOK=1 AUDIO_SPA_SOURCE=1` và
`AUDIO_YOUTUBE=1 AUDIO_SPA_SOURCE=1` với `check-audio-transcription.mjs`.
Tài liệu browser: [MessageSender](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender),
[webNavigation/getFrame và document identity](https://developer.chrome.com/docs/extensions/reference/api/webNavigation#method-getFrame).

## Ghim khung và phụ đề file SRT — build 1.58.1.4

Baseline trước sửa: local `c0fb01a3821fa8b9c7c18ed6df7811e13bffb3fa`, nhánh
`codex/upstream-1.58.1-openai`. Upstream vẫn `v1.58.1`; package `1.58.1-a.4`,
manifest numeric `1.58.1.4`, tên cài `1.58.1A`. Không đổi config, DB hoặc schema
ZIP/report/sync đã phát hành. Đối tượng người dùng báo lỗi là Teams trên Edge.

### Ghim khi họp hoặc chuyển tab

- Khung tại nguồn có nút **📌**, mặc định ghim trong phiên. Không tự đóng lúc
  im lặng; nếu ứng dụng gỡ host khỏi DOM thì gắn lại **cùng** React host, giữ
  vị trí/kích thước và trạng thái cuộn. Chỉ quan sát direct mount parents và
  body attributes, không quan sát toàn bộ subtree Teams. Repair dùng rAF gộp,
  health check 2 giây khi trang visible; đóng khung dọn observer/timer/rAF.
- Phiên kết thúc hoặc Audio đóng: khung ghim vẫn hiện phần lời gần nhất với
  nhãn **Đã dừng**, vô hiệu controls cần phiên và không tự kết nối lại. Lời
  tạm vẫn được ghi rõ chưa chốt. Đổi URL nguồn trong SPA xóa lời/bản dịch cũ
  khỏi khung; không chuyển quyền đọc sang route mới. Full document unload
  vẫn hủy khung. Bỏ ghim dùng lại vòng đời cũ; đây không phải lưu transcript.
- Muốn khung nổi trên cùng khi dùng tab khác: tại trang **Audio → Văn bản**
  bấm **Ghim cửa sổ trên cùng**. Dùng Document Picture-in-Picture cùng origin,
  portal từ chính Audio owner; không mở capture, peer WebRTC, provider request
  hoặc quyền nguồn thứ hai. Hiện final/partial, Dừng thu và theo dõi chữ mới;
  giữ tối đa 16.000 ký tự final + 4.000 draft trong view. Bản đầy đủ/TXT/SRT
  vẫn ở Audio. File và live có lựa chọn nguồn hiển thị riêng để không nhảy về
  kết quả file cũ sau khi dừng live.
- Giữ tab Audio mở. Đóng cửa sổ nổi không dừng thu; đóng/tải lại Audio đóng
  cửa sổ và dừng capture như trước. Bấm ghim cần thao tác trực tiếp; browser
  không hỗ trợ API báo rõ fallback về khung nguồn. Website không ấn định tọa
  độ OS của cửa sổ PiP. Pin/unpin/move/close không gọi AI hoặc tự nối lại.
- Ghim không làm Teams desktop hoặc microphone trở thành nguồn capture.
  Native video/iframe fullscreen vẫn giữ view chỉ đọc và click-through đã có.
  Tham khảo [Document Picture-in-Picture](https://developer.chrome.com/docs/web-platform/document-picture-in-picture).

### File audio thành SRT có mốc thời gian

1. Chọn file tại Audio, đổi **Đầu ra file → Phụ đề SRT có thời gian**. Chọn
   tự nhận dạng hoặc một ngôn ngữ (có mã ISO 639-1 khác). Nhóm ngôn ngữ live
   bên trên không bị thay đổi và không được gửi vào chế độ này.
2. Bấm chuyển file/hàng đợi rõ ràng. Một request `whisper-1` tại fixed private
   `/v1/audio/transcriptions`, `response_format=verbose_json`,
   `timestamp_granularities[]=segment`, một `language` nếu có; không streaming.
   Chép lời text mặc định vẫn `gpt-transcribe`; live vẫn `gpt-live-transcribe`.
3. Xem mốc đầu/cuối của tối đa 100 cue trong UI, bấm **Tải SRT**. File xuất đủ
   cue, UTF-8, `HH:MM:SS,mmm`, giữ khoảng im lặng và mốc API; không nội suy
   thời gian từ độ dài chữ hay đồng hồ giao diện. ZIP TXT/SRT gồm từng cặp kết
   quả đủ điều kiện; download/preview/khôi phục text không gọi lại OpenAI.

Mốc số hữu hạn, thứ tự và overlap sau làm tròn mili giây được kiểm cả lúc
nhận và xuất. Tối đa 20.000 cue, 500.000 ký tự, timeline 24 giờ, response 8 MiB;
giới hạn file 25 MB và hàng đợi cũ vẫn áp dụng. Thiếu/không hợp lệ timestamp
báo lỗi, không chế timing giả hoặc tự gọi paid repair. Hủy/đổi key/đóng trang
vẫn dùng guards/cleanup private port cũ. Sửa plain text khóa SRT; nút khôi phục
text gốc có timing mở lại xuất local, không căn lại thời gian tự động.

**Giới hạn model:** tài liệu OpenAI xác minh 10/11/2026 chỉ hỗ trợ
`timestamp_granularities[]` qua legacy `whisper-1`, dự kiến shutdown
**26/02/2027**. UI ghi rõ model/ngày này; không âm thầm đổi model mặc định
hoặc hứa timing chuẩn từng từ. Lần nâng cấp tiếp cần kiểm tra API thay thế
chính thức trước shutdown. Đây là mốc ASR ước lượng từ API, chưa đối chiếu
audio thật. [Speech-to-text / timestamps](https://developers.openai.com/api/docs/guides/speech-to-text).

Audio/text/segments và cửa sổ nổi chỉ ở RAM. Usage chỉ ghi model/usage số thực
API; duration timeline không được giả thành billed seconds. Chưa có giá mặc
định riêng cho Whisper trong máy thì cost hiển thị unknown, không ghi 0.

### Kiểm chứng build 1.58.1.4

- **Đã sửa:** pin nguồn chống mất DOM, giữ khung dừng/redact khi đổi URL,
  cửa sổ PiP từ Audio, file subtitle mode và tải SRT/ZIP có timestamp API.
- **Đã kiểm thử:** production Chrome với profile riêng, actual tab capture,
  WebRTC peer local, audio tổng hợp và API mock: host bị gỡ được gắn lại không
  remount, silence không ẩn khung, đổi route xóa lời, PiP thật hiển thị partial
  khi owner chạy nền và đóng PiP không dừng capture; download SRT giữ cue gaps,
  UTF-8 và milliseconds, sửa text khóa export, không phát sinh paid request
  khi ghim/khôi phục/tải. Unit tests kiểm timeline sai/thiếu, duration vs usage,
  fixed request/multilingual rejection và observer cleanup không quét subtree.
  Tổng **4.363 unit tests pass, 1 skipped**, loại free API theo
  `SKIP_FREE_API=true`; type-aware lint/format/build pass. Browser **147 checks**:
  46 nguồn HTTP, 46 YouTube fixture, 31 SRT/PiP/capture và 24 cập nhật cùng thư
  mục từ build `1.58.1.3`, giữ ID/config/private key và revision.
- **Chưa kiểm thử:** cuộc họp Teams thật, OpenAI thật, chất lượng/timing/độ trễ
  thực tế, mọi phiên bản Edge/OS hoặc nội dung DRM. Mock không chứng minh các
  kết quả đó; chưa khẳng định đã tìm đúng nguyên nhân lần mất khung trên Teams.
- **Bị chặn:** Edge kiểm thử ở môi trường trước thoát trước DevTools; không sửa
  policy hoặc profile đang dùng. Chrome production là bằng chứng hiện có.

Regression: `AUDIO_PIN_SRT=1` (file/SRT và PiP live), `AUDIO_SOURCE_VIEW=1`,
`AUDIO_YOUTUBE=1`; `AUDIO_UPGRADE_FROM=<ZIP build 1.58.1.3>` kiểm cập nhật cùng
thư mục/ID. Cả ba mode giữ microphone không capture, native CC/TTS độc lập,
và không đổi schema đã phát hành.

ZIP build: 458 file, **9.027.394 byte**, CRC và từng entry trùng production
build. SHA-256 `9649f55f339ae122e5d73114d2fc8ccb40a1c8f78c387aad9416579bb21054aa`;
manifest không key, hash standalone vocabulary review giữ nguyên. So với ZIP
`1.58.1.3` tăng 4.621 byte, không thêm framework hoặc model local nặng.

## Khung live trên các trang — build 1.58.1.3

Baseline: local `05aced5bb89615465b4a76c08ccee3832408c36b`; upstream vẫn
`v1.58.1`, tên cài `1.58.1A`, package `1.58.1-a.3`. Không đổi schema đã phát hành.

- Tại trang đang phát video/audio, mở popup → **Audio → Văn bản** →
  **Chép lời trực tiếp** → bắt đầu. Trang HTTP/HTTPS hoặc file có quyền
  extension sẽ hiện cùng khung kéo/resize/thu gọn, chữ tạm/final, chọn ngôn ngữ
  và dịch ngữ cảnh như YouTube. Giữ trang Audio mở; nút **Về tab đang phát**
  quay đúng nguồn. Thu trước/chuyển sau và upload file vẫn ở trang Audio.
- Khung thuộc đúng tab nguồn, không tự sao chép transcript sang các tab khác.
  Video nằm trong iframe vẫn lấy âm thanh từ tab; không xin micro hoặc đọc
  DOM của iframe. Native CC/Learning và TTS độc lập như trước.
- Trình duyệt không cho content script vào trang nội bộ, PDF viewer mặc định,
  một số trang được bảo vệ hoặc file chưa cấp quyền. Probe UI tối đa 3s;
  nếu không sẵn sàng thì giữ người dùng ở Audio, báo rõ và chép lời tại đó
  nếu browser vẫn cho thu âm. Không hứa mọi nội dung DRM đều capture được.
- View nguồn có cap local 6s/turn và silence gate 900ms; fallback không view
  vẫn 15s. Đây là giới hạn chốt local, không phải độ trễ end-to-end OpenAI.
- Loader nhỏ đăng ký ở top frame trước site-control, chỉ tải chunk React khi
  bắt đầu phiên hoặc phục hồi view đang thuộc nguồn. Không tạo shadow host,
  polling timer hay paid request khi duyệt trang bình thường. Không đổi quyền
  host hoặc âm thanh đã có; file chỉ dùng được nếu người dùng đã cho file access.
- Fullscreen theo container player giữ controls như YouTube. Fullscreen trực
  tiếp của `video`/`iframe` dùng native manual popover ở top document để đọc
  lời, tự theo dõi chữ mới, ẩn controls và không chặn click vào player; có nhắc
  **Esc để điều khiển khung**. Không append view vào fallback children của media,
  không vào child-frame DOM hoặc đổi fullscreen của website. Thoát fullscreen
  khôi phục controls/geometry trên cùng host, không tạo ASR/dịch khác.
  Popover được feature-detect; browser thiếu native API có thể xem ở Audio.
  Cơ chế top layer tham chiếu [HTML popover](https://html.spec.whatwg.org/multipage/popover.html)
  và [Fullscreen](https://fullscreen.spec.whatwg.org/); khả năng tương tác được
  quyết định theo kiểm thử browser, không chỉ dựa vào việc nhìn thấy khung.
- Authorization so đúng URL chuẩn hóa, tab ID, frame 0, extension ID và UUID
  session. Không nới quyền lấy lời sang website khác/cùng tab khác route.
  Source reload/navigation dừng phiên và vô hiệu source channel chưa dùng;
  owner khởi tạo trang lần đầu không làm mất source channel.

Hợp đồng cache/dịch, export TXT, ownership, giới hạn dữ liệu và lifecycle ở
phần build `1.58.1.2` bên dưới tiếp tục áp dụng. Không thêm config, DB, ZIP,
hosted service hoặc model mới. Key/audio/text vẫn đi theo đường private/RAM cũ.

### Kiểm chứng build 1.58.1.3

- **Đã sửa:** khung live đa trang, probe/lazy load và fallback Audio, bind URL,
  source reload cleanup; fullscreen video/iframe có view chỉ đọc không chặn player.
- **Đã kiểm thử:** 4.356 unit tests pass, 1 skipped; loại bộ `free-api.test.ts`
  theo `SKIP_FREE_API=true`. Type-aware lint/format/build pass. Production Chrome
  `156.0.8078.80`, profile riêng: 43 checks nguồn HTTP thông thường, 43 YouTube
  fixture và 24 cập nhật cùng thư mục từ ZIP build `1.58.1.2`; giữ ID/config/key
  sentinel. Bao gồm native iframe/video fullscreen, click-through, dừng khi reload
  nguồn cùng URL, và source channel cũ không được dùng sau reload. Unit tests
  kiểm false/failed/stalled probe 3s, URL/scheme và iframe/tab/sender isolation.
- **Chưa kiểm thử:** OpenAI thật/độ trễ và chất lượng thật; mọi player/sites bên
  thứ ba, live file URL/DRM, và profile Edge của người dùng. Browser fixture dùng
  actual tab capture/WebRTC peer local, audio tổng hợp và API mock, không chứng
  minh độ đúng của model hoặc khả năng capture mọi nội dung bảo vệ.
- **Bị chặn:** môi trường Edge kiểm thử trước đó thoát trước DevTools; kiểm tra
  production bằng Chrome, không sửa policy/profile Edge để vượt qua giới hạn.

Regression: `AUDIO_SOURCE_VIEW=1` và `AUDIO_YOUTUBE=1` trong
`check-audio-transcription.mjs`; `AUDIO_UPGRADE_FROM=<ZIP cũ>` cho cập nhật đè.
ZIP phải so khớp từng entry với build, qua CRC, manifest không key và giữ hash
`vocabulary-review.html` như các build trước. Không đổi schema/config dữ liệu.

## Khung YouTube và dịch theo ngữ cảnh — build 1.58.1.2

Baseline trước thay đổi: local `7ecdd82db0883d7587d6472113ec1b32e2bd6ec0`,
upstream vẫn là `v1.58.1` / `8f015c4a`. Không nâng hoặc đổi schema đã phát hành.

1. Tại video YouTube, mở popup → **Audio → Văn bản** → **Chép lời trực tiếp**
   → bắt đầu. Tự trở về tab video và hiện khung riêng. Giữ trang Audio mở.
2. Kéo thanh tiêu đề, đổi kích thước ở cạnh/góc, A−/A＋, thu gọn hoặc đặt lại.
   Khung theo fullscreen; cuộn lên đọc lại sẽ ngừng tự kéo xuống, có nút theo
   dõi chữ mới. Thu gọn không dừng thu. Nút Dừng chốt lượt cuối như trang Audio.
3. Bật **Dịch theo ngữ cảnh**, chọn ngôn ngữ (Anh/Việt đứng đầu). Mặc định tắt,
   đích Việt trong lượt mới; chỉ bật mới gửi text sang OpenAI và tính phí dịch.
   Bản gốc hiện ngay khi có delta; phần nháp ghi rõ chưa chốt và không được dịch.
4. **Mở Audio / Tải TXT** đưa về đúng trang đang thu, không tạo phiên khác.
   Audio giữ toàn bộ bản gốc để tải TXT; Copy khung chỉ lấy phần gần nhất và
   các bản dịch hiện có. Chưa có export toàn phiên song ngữ/SRT/timing chính xác.

**Dịch:** dùng model text đang chọn trong Settings (`providersConfig[0]`),
không dùng model ASR/TTS để dịch. Dùng `resolveOpenAIExecution` và SDK
`generateText`/`Output.object` hiện có; endpoint Responses cố định, key chỉ ở
background, actual SDK usage vào task subtitles. Mỗi đoạn chỉ dịch source;
4.000 ký tự nguồn trước nó hỗ trợ tham chiếu/thuật ngữ/giọng văn. Không đọc trước
video, không gửi toàn bộ CC/video và không tự gọi model tạo summary. Ngữ cảnh
này là cửa sổ lời đã nghe, không bảo đảm hiểu toàn video hoặc hết trễ.

**Độ trễ:** ASR streaming hiện delta ngay, phần dịch bắt đầu khi có final,
không thêm debounce/timer chờ gom câu. YouTube dùng cap local 6s cho giọng nói
liên tục (trước đây 15s, giảm 60% giới hạn chờ local), giữ silence gate 900ms;
nguồn khác vẫn cap 15s. Cap local không phải độ trễ end-to-end của model. Tối đa hai job song song; mỗi job tối đa
4 đoạn/6.000 ký tự source, context tối đa 4.000 ký tự/đoạn. Khi provider chậm,
ưu tiên phần chờ mới nhất; view chỉ giữ tối đa 24 đoạn/16.000 ký tự nguồn,
không đẩy hàng đợi vô hạn. Lời cũ vẫn có trong Audio. Không hứa số giây thật
khi chưa đo mạng/model/audio thật; test mock chỉ xác minh pipeline/UI.

Cache riêng mỗi phiên ở RAM, tối đa 32 batch, gồm prompt `live-context-v1`,
source/context/target/provider config/credential revision. Mở/di chuyển/resize/
thu gọn không gọi provider; bật lại giữ kết quả đã xong. Đổi đích/tắt dịch hủy
job dịch riêng, không ngắt ASR/TTS. Config đổi hủy/tắt dịch và xóa output cũ;
key/config được kiểm lại trước commit. Lỗi output/429/network làm tạm dừng
riêng dịch, có nút **Thử dịch lại** rõ ràng, không paid repair/retry tự động.
Source bị sửa/chèn lại vì final đến lệch thứ tự phải loại output không còn
khớp source/context, không gán nhầm bản dịch vào câu khác.

**View/sender/lifecycle:** chỉ tab YouTube nguồn HTTPS top-frame đúng runtime ID
và session được nhận snapshot/đổi target/dừng/focus Audio; tab YouTube khác,
iframe hoặc origin gần giống không được lấy transcript. Audio owner đúng tab
mới focus lại video. Offscreen sender phải đúng extension page; recording
blobURL/credentials/prompts không chuyển vào view. Snapshot source giữ cuối
16.000 ký tự final + 4.000 pending và tối đa 24 cặp đã kiểm tra. Có revision/
pull-generation guards, pull 15s chỉ khi live để dọn UI sau mất worker; không
reconnect hay tạo provider request. Đóng/reload owner, điều hướng source hoặc
phiên mới hủy translator và dọn view. Geometry riêng `liveTranscriptWindowV1`
chỉ local; không đưa text/geometry vào config sync hoặc database khác.

**Tham khảo nguồn mở (09/11/2026):** tham khảo cơ chế, không chép code hoặc
đổi runtime/provider của fork.

- [MeetCaptioner queue](https://github.com/LeHoangTuanbk/meetcaptioner/blob/main/entrypoints/content/translation-queue.ts):
  final-only enqueue, giới hạn concurrency và ưu tiên phần gần viewport;
  [segmenter](https://github.com/LeHoangTuanbk/meetcaptioner/blob/main/entrypoints/content/caption-segmenter.ts)
  dùng giới hạn mềm/cứng và ranh giới câu. Áp dụng final-only/bounded scheduling;
  fork ưu tiên đoạn mới đang live, không tự retry errors như queue tham khảo.
- [AirSubs offscreen](https://github.com/hyderoo/airsubs/blob/main/src/offscreen/offscreen.js):
  thu chunk, backlog/drop, draft/refinement và local audio routing. Fork giữ
  WebRTC streaming sẵn có để khỏi chờ đủ chunk âm thanh; không thêm lượt ASR
  paid refinement hoặc provider Groq/local Translator.
- [Live Subtitle scheduler](https://github.com/xu-0306/live-subtitle/blob/main/backend/translation_scheduler.py):
  bounded concurrency và latest-wins/stale-result ownership. Áp dụng cancellation
  và kiểm epoch, không yêu cầu người dùng cài local server/model.

Khung là transcript trực tiếp, không đồng bộ phụ đề cứng vào video; seek không
đọc lại phần chưa nghe. CC và buffer dịch trước hai phút hiện có độc lập.

### Kiểm chứng build 1.58.1.2

- **Đã sửa:** khung YouTube/điều khiển phiên, dịch ngữ cảnh opt-in, bounded
  scheduling/cache RAM, guard và tài liệu nâng cấp; bản cài vẫn `1.58.1A`.
- **Đã kiểm thử:** 4.351 unit tests pass, 1 test được chủ động skip với
  `SKIP_FREE_API=true`; format/type-aware lint pass. Production Chrome
  `156.0.8078.80`, isolated profiles: 38 kiểm tra YouTube/live/dịch, 24 Audio
  và cập nhật cùng thư mục từ ZIP `1.58.1.1` (giữ ID/config/key sentinel), 59
  kiểm tra study-flow/Learning/geometry. Một lượt study-flow gặp race ở cue
  word sau auto-pause; lượt chạy lại qua đủ 59, không sửa cơ chế Learning.
- **Chưa kiểm thử:** API OpenAI thật, tốc độ/độ chính xác dịch và ASR thật,
  video/ads/DRM YouTube thực tế, và phiên live trên profile Edge của người dùng.
  Test dùng actual tab capture/WebRTC tới peer local, âm tổng hợp, API giả lập;
  không lấy kết quả mock làm số đo độ trễ/độ đúng của model.
- **Bị chặn:** Edge trong môi trường kiểm thử thoát trước kết nối DevTools;
  dùng Chrome cho kiểm tra production, không đổi policy/profile của người dùng.
  Không có key riêng được dùng cho paid tests.

Regression: `scripts/debug/check-audio-transcription.mjs` (thêm
`AUDIO_YOUTUBE=1` để kiểm tra view/dịch, hoặc `AUDIO_UPGRADE_FROM=<ZIP cũ>`
cho cập nhật cùng thư mục), `check-youtube-live-view.mjs`, `check-study-flow.mjs`.
Các unit guards/state/provider nằm trong `tab-audio-view.test.ts`,
`tab-audio-translation.test.ts`, `live-translation.test.ts`. ZIP phải qua CRC,
so khớp mọi entry với build, manifest không key và hash review HTML giữ nguyên.

## Vì sao cuộc họp có thể hiện chữ ngay?

Luồng ASR streaming gửi âm thanh liên tục, nhận partial/delta trong khi nói,
và nhận final khi hết lượt. Chữ tạm có thể thay đổi theo ngữ cảnh mới; không
coi partial là bản hoàn chỉnh. Xem [Microsoft captioning concepts](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/captioning-concepts).

Luồng file và luồng live khác nhau theo [OpenAI transcription overview](https://developers.openai.com/api/docs/guides/transcription):

| Chế độ            | Model                 | Đường xử lý                                              | Giá tham khảo 09/11/2026 |
| ----------------- | --------------------- | -------------------------------------------------------- | ------------------------ |
| File/bản thu xong | `gpt-transcribe`      | multipart `/v1/audio/transcriptions`, SSE text           | $0,0045/phút             |
| Trực tiếp         | `gpt-live-transcribe` | transcription-only Realtime, WebRTC audio + data channel | $0,017/phút              |

Nguồn giá: [file model](https://developers.openai.com/api/docs/models/gpt-transcribe),
[live model](https://developers.openai.com/api/docs/models/gpt-live-transcribe).
Không dùng model hội thoại để trả lời bằng giọng nói. Không dùng hosted ASR
của upstream. Hai model độc lập với model dịch/TTS/phát âm đang cấu hình.

## Hợp đồng triển khai phải giữ khi merge

**File:** tối đa 25.000.000 byte/file, 8 file/tổng 100 MB ở UI, 2 transfer/job
toàn background. MP3/MPGA/MPEG, MP4/M4A, WAV, WebM, OGG, FLAC có header check.
Port chỉ nhận trang Audio top frame, UUID, metadata có giới hạn, base64 chunks
192 KiB stop-and-wait, đúng thứ tự/số byte và commit cuối. Hủy/disconnect giải
phóng job, buffer/timer; timeout chuẩn bị 30s, API tối đa 15 phút. Provider nhận
generic `audio.<format>`, không tên file/path/URL gốc. Không tự transcode hoặc
ngắt file lớn thành nhiều paid requests. SSE có UTF-8 incremental decoding,
giới hạn 8 MiB response/500.000 ký tự transcript; thiếu done vẫn là nháp.

**Thu tab:** source channel RAM một lần, 5 phút, buộc đúng owner tab và nguồn
đã chọn từ popup. Một phiên thu/profile; source channel không chứa text/path.
Service worker xin stream ID; offscreen chung với TTS nhận audio-only stream,
không xin micro. Route stream tới AudioContext destination để người dùng vẫn
nghe tab. Không đóng offscreen chung khi dừng riêng TTS/capture. Lý do offscreen
`USER_MEDIA` và `AUDIO_PLAYBACK` không làm thay đổi playback/cancellation TTS.

**Live:** permanent key chỉ background; mint token 60s qua fixed
`/v1/realtime/client_secrets`, cấu hình `type:transcription`,
`audio.input.transcription.model:gpt-live-transcribe`, `languages` array và
prompt có giới hạn, `turn_detection:null`. Background dùng ephemeral token
để đổi SDP tại fixed `/v1/realtime/calls`; cả hai token không trả ra page,
content script hoặc offscreen. Mỗi session chỉ nhận một offer; không paid retry.
Offscreen giữ RTCPeerConnection/data channel và audio tracks, nên không phụ
thuộc popup/foreground. [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc),
[Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription).

Local level gate chốt lượt sau khoảng 900ms yên lặng khi đã có speech-level
audio; tối đa 15s/lượt nói liên tục (YouTube live từ build 1.58.1.2 là 6s), clear khoảng im lặng dài. Đây là gate âm
lượng, không phải model tách ngữ nghĩa hoặc speaker diarization. Không bật
server VAD/semantic VAD cho `gpt-live-transcribe`. Commit/delta/final ghép theo
item ID và previous-item links, xử lý final đến lệch thứ tự; chưa liên kết vẫn
là provisional. Tối đa 2.000 lượt/500.000 ký tự; update theo tuyến tính với số
lượt, không quét lồng nhau. Dừng chủ động giữ tối đa 8s để chốt câu cuối, chưa
chốt kịp phải ghi nháp. Không tự reconnect/replay âm thanh bị ngắt.

**Giới hạn và cleanup:** 30 phút/phiên; WebM Opus 96kbps, dừng trước 25 MB.
GetUserMedia startup 15s, kết nối RTC 35s; stop/close/page reload/source
navigation/revocation dọn tracks, graph/context, recorder, peer, channel và
timers. Late getUserMedia phải stop ngay stream vừa về. Heartbeat offscreen
15s giữ MV3 và kiểm owner/session/credential revision; mất worker/key phải
dừng. Recording URL chỉ trong extension RAM, thu hồi sau nhận hoặc tối đa
5 phút; không cho page bên ngoài lấy blob qua RPC.

**Dữ liệu:** không thêm migration, DB hoặc config key; không đưa audio,
transcript, source URL/tên file/prompt vào config sync, PDF/vocab/reading hoặc
pronunciation histories. Usage DB1 chỉ ghi task `other`, model và usage số
thật; file có duration mới tính giá phút. Live chưa tổng hợp server-reported
audio duration, nên cost giữ **unknown**, không lấy elapsed time hay token
text để giả chi phí. Giá UI là tham khảo, không phải số phí đã xác minh.

## Source và kiểm thử

- `src/entrypoints/audio-transcription/`: UI/preview/hàng đợi/exports.
- `src/utils/audio-transcription/`: metadata/chunks/SSE/client/live transcript.
- Background `audio-transcription.ts`, `tab-audio.ts`: endpoint/credential,
  source ownership, RPC/port/epoch/usage.
- Offscreen `tab-audio.ts`: capture/recorder/WebRTC/local gate/cleanup.
- Unit: `transcription.test.ts`, background `audio-transcription.test.ts`,
  `tab-audio.test.ts`, existing TTS/usage suites.
- Production: `scripts/debug/check-audio-transcription.mjs`; fixture oscillator
  được capture thật và WebRTC peer local, provider text/SDP/API được mô phỏng.
  Không coi test này là chứng minh chất lượng model/giọng họp thật. Script nhận
  `VOCAB_BROWSER`; dùng profile riêng, không đọc key/profile người dùng.

Kết quả phát hành và kiểm thử cuối ghi trong báo cáo nâng cấp 1.58.1A.
