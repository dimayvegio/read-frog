# F23 — Audio thành văn bản và chép lời tab trực tiếp

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
- File/text chỉ ở RAM trong lượt đang mở; tải kết quả trước khi đóng. Chưa có
  transcript history, speaker labels, word timing hoặc SRT đồng bộ video.

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
