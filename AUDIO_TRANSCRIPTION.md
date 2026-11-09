# F23 — Audio thành văn bản và chép lời tab trực tiếp

Phát triển từ local HEAD `1ea3c17e`, sau F22. Giữ toàn bộ engine dịch, các
DB/ZIP/config đã phát hành và Microsoft/OpenAI TTS. Đây là trang Audio riêng,
không thay track CC, không tự tạo overlay phụ đề hoặc tự thu khi mở video.

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
audio; tối đa 15s/lượt nói liên tục, clear khoảng im lặng dài. Đây là gate âm
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
