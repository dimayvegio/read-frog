# Lồng tiếng video — 1.59.3A.8

Package `1.59.3-a.8`, manifest `1.59.3.8`, display `1.59.3A`.

Mới a.8: chọn **15s / 30s / 1 / 2 / 5 / 10 phút** cho cả Tự phân tích khi xem và
Chuẩn bị trước. Thu trước bắt đầu từ vị trí hiện tại, dùng được với video dài;
xong quay về vị trí cũ, tạm dừng. Đổi thời lượng sẽ tắt AI/chờ bật lại, không tự
tính phí. CC toàn cảnh có giới hạn vẫn dùng cho ngữ cảnh; chỉ gán giọng cho câu
đã nghe. Xem [a.8](HTML_FIXED_PANE_AUDIO_A8.md); 15s cố định bên dưới là hành vi
lịch sử a.7, nay là giá trị mặc định có thể đổi.

Mới: **Tự phân tích khi xem**, bật AI rồi tiếp tục phát, không cần tự chuẩn bị file.
Lấy mẫu 15 giây mỗi phần 10 phút; chỉ gán người nói cho câu đã nghe, còn lại giọng
mặc định. Không tự phân tích khi master tắt; giữ chế độ Chuẩn bị trước. Hợp đồng,
giới hạn và store privacy trong [a.7](STORE_AUTOMATIC_AUDIO_A7.md). Các phần a.5/a.6
dưới đây mô tả chế độ chuẩn bị trước và các điều khiển vẫn giữ nguyên.
Baseline a.6: `6fd9206d` (a.5).
Review/tối ưu: [DUBBING_PERFORMANCE_A6.md](DUBBING_PERFORMANCE_A6.md).
Baseline a.5: `4bb30179` (a.4).
Baseline a.4: `e6f57e56aec271d181832ec89a225c35b6718d55` (a.3).
Bản a.6 tối ưu và giảm trần chuẩn bị còn 10 phút (không tự chia video dài).
Bản a.5 thêm mix/offset trực tiếp và phân tích audio nhiều người nói opt-in.
Bản a.4 thêm giảm âm thông minh; bản a.3 thêm lồng tiếng.
Không merge upstream trong bản này.

## Dùng thế nào

Trên YouTube hoặc ani.pm, mở logo extension trong player → **Lồng tiếng OpenAI**.
Chọn **Lời gốc** hoặc **Lời dịch**, chọn phần trăm âm gốc, bấm **Bắt đầu lồng tiếng**.
Mặc định đọc lời dịch và giữ 5% âm gốc lúc có lời thoại. Đổi lời gốc/lời dịch sẽ dừng;
người dùng bấm Bắt đầu lại. Đóng menu vẫn tiếp tục đọc; nút Tắt kết thúc phiên.
Giọng/model/tốc độ/chỉ dẫn lấy từ cấu hình OpenAI TTS hiện tại, kể cả khi lựa
chọn TTS cũ là Microsoft. Đổi giọng trong Cài đặt → Text to Speech.

Lời gốc tải CC native theo thao tác này, không bật dịch. Lời dịch yêu cầu bật
phụ đề dịch của extension trước và chỉ đọc các kết quả đã commit vào track dịch.
Không gọi translator thứ hai, không tự bật Learning hay AI chia câu.
ani.pm cần SOFT + CC English; HARD không tạo ra dữ liệu CC. Không tự bật track
bị tắt, đổi server, OCR, ASR, nhân bản giọng hay xuất video lồng tiếng. Thu trước audio
chỉ chạy qua bước Chuẩn bị explicit bên dưới.

## Mix và lệch giọng trực tiếp (a.5)

- Âm thuyết minh riêng 0–150%, mặc định 100%. Một Web Audio gain node của phiên
  hiện tại; không đổi cấu hình TTS, không tạo lại audio. WAV PCM được đo peak;
  gain bị chặn để riêng giọng đọc không vượt 0,98 peak. Audio lớn có thể không
  tăng đủ 150%; không tuyên bố đây là loudness normalization hay tách lời.
- Âm gốc 0–100% vẫn tương đối với volume player, đổi ngay trong lúc đang đọc,
  giữ ownership/mute/ramp cũ. Trên 100% ở slider chỉ áp dụng cho giọng AI.
- Lệch −5 đến +5 giây, bước 0,1 giây: âm đi trước khi âm, đi sau khi dương.
  Sửa vị trí phát trong audio đã đệm, không tua video hoặc tự synthesize lại.
  Prefetch vẫn theo đồng hồ video. Cache giữ cả cue đang chờ phát trễ, tối đa
  sáu mục; phần quá khứ đã rơi khỏi cache không tự được tạo lại khi chỉnh offset.
  Có thể cần đợi câu có audio tiếp theo. Không phải forced alignment theo từ.
- Không resume pause của người dùng, không mở player mới; sửa trong lúc play()
  còn pending được áp dụng khi đúng promise đó hoàn tất. Giữ đuôi do extension
  sở hữu được nhả khi offset mới đưa câu về tương lai; không replay video kết thúc.

## AI phụ đề và giọng đọc — chuẩn bị trước (a.5, mặc định tắt)

Logo player → **AI phụ đề và giọng đọc** → bật → tùy chọn MP3/WAV cùng video →
**Chuẩn bị và phân tích audio**. Nếu không chọn file, extension dùng captureStream
của chính video để thu từ đầu ở 1×, encode MP3 mono 16 kHz/32 kbps cục bộ.
Việc này mất bằng thời lượng video, có thể chuyển tab. Player có thể không cho
lấy audio (CORS/DRM/khả năng trình duyệt); khi đó chọn MP3/WAV tương ứng, không
có fallback tải từ dịch vụ khác. Không thu microphone. Thu xong quay về vị trí,
tốc độ cũ và để pause; hủy cùng nguồn cũng khôi phục, còn tua/đổi nguồn của người
dùng không bị ghi đè. Ngừng và dọn stream/node/timer/context khi hủy, đổi nguồn,
lỗi, hết thời gian hoặc đóng. Audio và kết quả chỉ ở RAM, không sync/export.

Giới hạn một phiên: MP3/WAV ≤8 MiB, ≤10 phút, CC ≤1.500 mẩu/100.000 ký tự;
tối đa hai phân tích toàn extension và một phân tích/tab. Chỉ gửi audio đã chọn
hoặc đã thu cùng title và CC đánh số trực tiếp tới fixed OpenAI Chat Completions,
model **gpt-audio-1.5**; không gửi URL/path/file name/khóa vào prompt. Có tính phí;
usage numeric ghi token thực API, chi phí mixed audio/text chưa biết chính xác.
Không tự thử lại kết quả hỏng/thiếu chắc chắn hoặc tự tạo CC khi thiếu.

AI nghe audio thật, tóm tắt chủ đề/thuật ngữ, phân biệt tối đa tám người nói và
chọn preset voice riêng, tốc độ 0,8–1,2×, chỉ dẫn thể hiện. Không đoán từ giới tính
nhân vật/tên, không xác định danh tính hay clone giọng; mô tả nam tính/nữ tính chỉ
là cảm nhận âm thanh. AI trả chỉ số CC, không tự tạo timestamps. App xác thực
range tăng, không trùng, nằm trong track và preset khác nhau. Chỉ gán câu có
confidence ≥0,75, một người nói và phủ ≥60% thời gian cue; đây là ngưỡng bảo thủ
của ứng dụng, không phải xác suất đã hiệu chuẩn. Mẩu trộn/nhiều người/thiếu vùng
phủ dùng giọng mặc định. Không ghép lời gốc qua ranh giới người nói đã gán.

Ngữ cảnh AI đi vào viewerContext hiện có (quoted as data, cache identity có context)
của engine dịch, không tạo translator/queue thứ hai. Áp dụng phân tích explicit
hủy kết quả cũ và có thể dịch lại khi phụ đề đang bật. Trong mode này dùng nguyên
ranh giới native CC, tạm bỏ display AI segmentation để giữ speaker-index mapping;
Learning chia câu vẫn độc lập. Tắt mode trở về xử lý CC thường. Mô hình tạo giọng
vẫn là cấu hình OpenAI TTS của người dùng: **gpt-realtime-2.1-mini** hoặc
**gpt-4o-mini-tts**. Không thay đổi lựa chọn model đã lưu.

Xong phân tích, bật phụ đề hoặc bấm **Bắt đầu lồng tiếng**. Khi Bắt đầu cần chuẩn
bị AI trước, thao tác đầu chỉ chuẩn bị; bấm lại sau khi xong để unlock playback
trong user gesture. Đổi config/key/native CC/video/URL hủy/loại kết quả cũ;
không tự trả tiền để phục hồi. Background recheck frame/document IDs và top route
trước/sau API và khi đang chạy, strict legacy fallback; hủy/disconnect abort fetch.
Không thêm permission, published config/migration/DB/ZIP schema hay cloud backend.

## Đồng bộ và giới hạn

- Mỗi phiên thuộc đúng URL, video DOM/currentSrc, nguồn caption và cấu hình.
  Đổi video/tập/route/config/ngữ cảnh, quảng cáo, tháo player hoặc đóng trang sẽ
  dừng, hủy yêu cầu và bỏ audio trong RAM. Đổi khóa được kiểm trước/sau mỗi yêu
  cầu và kiểm status trong phiên (tối đa một lượt kiểm mỗi 2 giây).
- Đọc đồng hồ video, tick 100 ms; tối đa 2 yêu cầu tạo giọng, 6 câu trong cửa sổ
  30 giây. Audio hoàn tất tối đa 6 mục/16 MiB. Khi người dùng pause chỉ chuẩn bị
  một câu; tua hủy phần đang làm sai vị trí, cache cùng phiên có thể dùng lại.
- Lời gốc ghép cục bộ các mẩu liên tiếp chưa hết câu, tối đa 8 giây/1.600 byte;
  không sửa track CC/display/Learning. Lời dịch dùng nguyên từng fragment đã
  commit, không lặp một bản dịch dài cho nhiều mẩu gốc. Câu quá dài chia cục bộ,
  thời gian phần chia là nội suy theo độ dài, không phải forced alignment.
- Giữ cao độ bằng `HTMLAudioElement.preservesPitch`; tốc độ phát thích nghi từ
  0,5 đến 1,75×. Khi chưa có audio hoặc câu đọc dài hơn chỗ video, có thể pause
  video để chờ. Chỉ phát lại nếu extension sở hữu lần pause đó; pause của người
  dùng không bị tự mở. Nếu người dùng phát tiếp lúc giữ đuôi câu, bỏ đuôi cũ.
  Câu cuối được đọc hết mà không tự phát lại video từ đầu.
- Ưu tiên thuyết minh (a.4): hạ âm gốc trong 100 ms trước khi phát câu TTS.
  Giữ thấp đến hết cả giọng đọc và khoảng CC gốc, kể cả khi TTS kết thúc sớm.
  Sau đó giữ thêm 400 ms theo đồng hồ thực để nối các câu gần nhau, rồi phục
  hồi trong 600 ms. Đây là giảm toàn bộ âm gốc, không phải tách riêng lời thoại.
  Pause/network waiting trả âm qua ramp; resume tiếp tục ưu tiên câu còn lại.
  Seek hủy giữ âm câu cũ và phục hồi qua ramp nếu chưa bắt đầu câu mới.
  Stop/ad/source change/end hủy timer cũ, trả mức gốc ngay; muted và thay
  đổi âm lượng người dùng vẫn được giữ. Chỉ chạy ramp timer khi đổi mức.
  Pre-duck thuộc đúng cue/epoch, có guard pause/seek/stop/late play; không gọi
  provider thêm, không phát lại câu chỉ để điều chỉnh âm lượng.
- WAV qua private `openai-tts-file` port hiện có, không dùng global speaker hay
  cancellation của MP3/vocabulary. Unlock cùng media element ngay trong click.
  Lỗi provider/audio dừng phiên, không tự retry tính phí. Không hứa thời gian
  thực tuyệt đối: tốc độ mạng/model và độ dài lời thoại có thể làm video chờ.

## Quyền riêng tư, lưu trữ và nâng cấp

Lồng tiếng thường chỉ gửi văn bản của câu phụ đề được chọn tới fixed OpenAI endpoints
qua private background runtime đã có. Không gửi file/video/audio/tab URL vào
TTS payload. Mode chuẩn bị AI explicit gửi audio như mô tả ở trên; không lộ key cho content script, không thêm permission hoặc dịch vụ.
Chỉ synthesize sau Bắt đầu; xem menu/đổi lựa chọn/di chuyển video khi đã tắt không
phát sinh request tạo giọng. Phần trăm/mode/phiên/cache chỉ RAM, không đổi config,
DB, migration, sync, vocabulary ZIP/report hay các định dạng đã phát hành.
Dịch phụ đề bình thường và bộ đệm dịch hai phút vẫn độc lập.

Khi merge upstream, bảo toàn capability theo adapter, provider nằm ngoài vòng
đời menu, read snapshot trực tiếp từ `subtitlesStore` sau load CC, hủy theo
nguồn/config/key, pause ownership và private TTS file transport. Không đưa lại
provider của dự án tham khảo hay đổi native `getVideoElement` cũ để phục vụ dub.

## Tham khảo

Nghiên cứu ý tưởng, triển khai độc lập; không chép source hay thêm service:

- [VOT](https://github.com/ilyhalight/voice-over-translation):
  `src/videoHandler/modules/translationPlayback.ts` (pause ownership),
  `src/videoHandler/modules/ducking.ts` (âm lượng tương đối/ramp/restore).
- [Mouse Tooltip Translator](https://github.com/ttop32/MouseTooltipTranslator):
  `src/subtitle/baseVideo.js` (pause do extension sở hữu và vòng đời caption/TTS).
- [OpenAI speech](https://developers.openai.com/api/docs/guides/text-to-speech):
  ghi rõ giọng AI; giữ đúng transport/model mà private runtime hiện tại hỗ trợ.

## Kiểm thử

Bản a.5 thêm kiểm tra mix/offset, PCM peak, capture cleanup/restore, speaker-index
validation/fallback, key/document guards và provider opt-in/cancel. Bằng chứng
release cuối nằm trong báo cáo dưới đây; API được giả lập, chưa đánh giá chất
lượng phân biệt người nói/giọng trên OpenAI thật.

Kết quả release a.5: **4.659 test pass, 1 skip chủ đích**, full suite với
`SKIP_FREE_API=true` và `--maxWorkers=4`. Production Chrome: 17 kiểm tra YouTube
và 19 ani.pm (36 tổng), gồm upload audio, context trong engine dịch, hai preset
khác nhau, mix/offset, và **captureStream thật + MP3 encode thật từ video tổng hợp
20 giây**, phục hồi 7 giây/1,25×/pause sau khi thu. Model/API được giả lập; không
đo chất lượng diarization hay độ trễ OpenAI thật. Audit 201 script không có endpoint
bị cấm; lint/type-check/format đạt. ZIP 22,12 MB (decimal), giữ nguyên key/quyền.

Một lượt full mặc định khi chạy cùng build/browser có lỗi ở test Learning
`sentence-study` (chưa cập nhật currentTime sau bấm Next); chạy riêng và các lượt
full giới hạn bốn worker đều đạt. Không sửa code Learning trong bản này.
Bằng chứng local: `.codex/dubbing-a5-tests.log`, `.codex/dubbing-a5-build.log`,
`.codex/video-dubbing-youtube-1794709560129/evidence.json`,
`.codex/video-dubbing-anipm-1794709729452/evidence.json`.

Kết quả a.4 trước đây:

4.636 test pass, 1 skip có chủ đích; 34 test cho dubbing, gồm 7 test thêm ở a.4
cho mặc định 5%, pre-duck, giữ hết câu, nối câu, phục hồi, hủy timer và không
khởi chạy trùng khi play còn chờ. Hai profile production YouTube/ani.pm có
24 kiểm tra đạt, gồm mức 5%, giữ thấp sau TTS và phục hồi sau hết câu CC.
Provider được giả lập; video tổng hợp, audio phát thật. Lint/type-check/format
và audit 201 script runtime đạt. Test logic bao gồm giới hạn job/cache,
key/source/config/ad invalidation, late completion, pause/seek/rate/end/volume,
native grouping và không dịch thêm. `scripts/debug/check-video-dubbing.mjs`
dùng Chrome profile tạm, video tổng hợp và mock OpenAI; chạy mặc định ani.pm,
`DUBBING_PLATFORM=youtube` cho production MAIN-world bridge/JSON3 captions.
Không dùng tài khoản/site media thật, không gọi OpenAI tính phí; chưa đánh giá
chất lượng giọng hoặc độ trễ trên mạng thật. Người dùng Reload bản cài hiện có
và thử trên video thật. Không điều khiển Edge đang dùng trong bước cập nhật ZIP.
