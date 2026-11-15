# Lồng tiếng video — 1.59.3A.3

Package `1.59.3-a.3`, manifest `1.59.3.3`, display `1.59.3A`.
Baseline trước sửa: `ca992148d83ee2f0ca9fcfdebf7920433758d612` (a.2).
Không merge upstream trong bản này.

## Dùng thế nào

Trên YouTube hoặc ani.pm, mở logo extension trong player → **Lồng tiếng OpenAI**.
Chọn **Lời gốc** hoặc **Lời dịch**, chọn phần trăm âm gốc, bấm **Bắt đầu lồng tiếng**.
Mặc định đọc lời dịch và giữ 20% âm gốc lúc đang đọc. Đổi lựa chọn sẽ dừng;
người dùng bấm Bắt đầu lại. Đóng menu vẫn tiếp tục đọc; nút Tắt kết thúc phiên.
Giọng/model/tốc độ/chỉ dẫn lấy từ cấu hình OpenAI TTS hiện tại, kể cả khi lựa
chọn TTS cũ là Microsoft. Đổi giọng trong Cài đặt → Text to Speech.

Lời gốc tải CC native theo thao tác này, không bật dịch. Lời dịch yêu cầu bật
phụ đề dịch của extension trước và chỉ đọc các kết quả đã commit vào track dịch.
Không gọi translator thứ hai, không tự bật Learning hay AI chia câu.
ani.pm cần SOFT + CC English; HARD không tạo ra dữ liệu CC. Không tự bật track
bị tắt, đổi server, OCR, ASR, thu âm, nhân bản giọng hay xuất video lồng tiếng.

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
- Âm lượng giảm/tăng theo ramp ngắn, so với mức của người dùng; giữ muted và
  thay đổi âm lượng của người dùng. Ramp chỉ có timer khi đang chuyển mức.
  Pause/seek/stop/end trả âm gốc; không giữ âm gốc nhỏ sau khi tắt.
- WAV qua private `openai-tts-file` port hiện có, không dùng global speaker hay
  cancellation của MP3/vocabulary. Unlock cùng media element ngay trong click.
  Lỗi provider/audio dừng phiên, không tự retry tính phí. Không hứa thời gian
  thực tuyệt đối: tốc độ mạng/model và độ dài lời thoại có thể làm video chờ.

## Quyền riêng tư, lưu trữ và nâng cấp

Chỉ văn bản của câu phụ đề được chọn gửi trực tiếp tới fixed OpenAI endpoints
qua private background runtime đã có. Không gửi file/video/audio/tab URL vào
TTS payload, không lộ key cho content script, không thêm permission hoặc dịch vụ.
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

27 test mới cho dubbing; hai profile production YouTube/ani.pm có 18 kiểm tra,
11 kiểm tra MP3/TTS/PDF selection cũ cũng đạt (mock OpenAI, file MP3 thật
và decoder độc lập). Lint/type-check/format và audit 201 script runtime đạt.
Kết quả full suite cuối ghi trong release notes. Test logic bao gồm giới hạn job/cache,
key/source/config/ad invalidation, late completion, pause/seek/rate/end/volume,
native grouping và không dịch thêm. `scripts/debug/check-video-dubbing.mjs`
dùng Chrome profile tạm, video tổng hợp và mock OpenAI; chạy mặc định ani.pm,
`DUBBING_PLATFORM=youtube` cho production MAIN-world bridge/JSON3 captions.
Không dùng tài khoản/site media thật, không gọi OpenAI tính phí; chưa đánh giá
chất lượng giọng hoặc độ trễ trên mạng thật. Người dùng Reload bản cài hiện có
và thử trên video thật. Không điều khiển Edge đang dùng trong bước cập nhật ZIP.
