# Review và tối ưu chuẩn bị/lồng tiếng — a.6

Baseline `6fd9206d` (1.59.3-a.5). Bản mới package `1.59.3-a.6`, manifest
`1.59.3.6`, display `1.59.3A`. Phạm vi là chuẩn bị audio, nhiều người nói,
ngữ cảnh và playback; không thay engine dịch, PDF, Learning hay dữ liệu đã lưu.

## Các phát hiện đã sửa

| Mức | Trước                                                                                                                  | Sau                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| P1  | Video đang chạy tiến thêm thời gian trong lúc await encoder/context, bị nhận nhầm là người dùng tua; chuẩn bị thất bại | Pause và chụp vị trí trước await; tiếp tục tôn trọng thao tác play/seek/rate của người dùng và chỉ khôi phục nguồn còn sở hữu |
| P1  | Encoder flush ném lỗi sau khi đã dọn timer/listener, promise không kết thúc và giữ AudioContext/stream                 | Bắt lỗi, reject, chạy cleanup đầy đủ; không gửi audio lỗi và không tự retry                                                   |
| P2  | Tick playback serialize toàn config/profile thành JSON mỗi 100 ms                                                      | So sánh snapshot immutable theo tham chiếu và scalar; vẫn đổi nguồn/config/profile là hủy                                     |
| P2  | Mỗi PCM block lấy channel data bên trong từng vòng sample và cấp phát Int16Array mới                                   | Lấy mỗi kênh một lần/block, tái sử dụng PCM buffer, giữ clipping/downmix/peak; bắt cả lỗi encode                              |
| P2  | Mỗi tick scan cả cue track để kiểm membership                                                                          | Set cue ID theo đúng reference track; đổi track cập nhật Set, stop dọn cả track/Set                                           |
| P2  | Chọn đọc lời gốc vẫn dựng/hash cue lại khi một bản dịch mới xuất hiện                                                  | Lời gốc chỉ rebuild khi source đổi; lời dịch vẫn theo committed translation                                                   |
| P2  | Decode toàn base64 chỉ để kiểm magic, tạo thêm binary string tới 8 MiB                                                 | Kiểm base64/padding/byte bound, decode 16 ký tự header; không thay payload audio                                              |
| P2  | Đã có profile thì chọn file khác rồi Chuẩn bị vẫn trả cache cũ                                                         | File mới explicit bỏ qua nhánh reuse; cache cũ chỉ dùng khi không có file mới                                                 |

Trần chuẩn bị đổi **30 → 10 phút** cho video/audio, không tự chia/gửi các phần
tiếp theo. UI, metadata file, preflight video và schema private background cùng
giới hạn 600 giây. Capture đếm cả số mẫu thực, cho tối đa một block codec đệm;
deadline dùng duration chụp lúc bắt đầu, không tin duration site thay đổi về sau.
Trần 8 MiB giữ cho MP3/WAV; metadata hợp lệ không miễn giới hạn byte.

## Số đo cục bộ trước/sau

Chạy tuần tự trên cùng máy, Node v26.13.0, median bảy lượt sau warm-up.
Script: `scripts/debug/benchmark-dubbing-preparation.mjs`; kết quả local:
`.codex/dubbing-a6-benchmark.json`. Baseline giữ đúng thuật toán a.5,
candidate nạp trực tiếp source helper mới; kiểm PCM giống nhau trước đo.

| Kernel                                                       |        a.5 |      a.6 |
| ------------------------------------------------------------ | ---------: | -------: |
| 3.000 kiểm tra ownership, config giả lập + 1.500 assignments |  229,39 ms | 0,035 ms |
| Ký tự serialize mỗi kiểm tra đó                              |    118.634 |        0 |
| Trộn PCM 10 phút stereo/16 kHz/4.096 mẫu, 2.344 block        |   94,89 ms | 45,51 ms |
| Gọi getChannelData/block stereo                              |      8.192 |        2 |
| Số PCM Int16Array cấp phát cho fixture đó                    |      2.344 |        1 |
| Tổng byte PCM cấp phát cho fixture đó                        | 19.202.048 |    8.192 |

Kernel PCM giảm khoảng **52%** thời gian. Tổng cấp phát khác với peak heap/RAM
hệ điều hành: không tuyên bố giảm 19 MB RAM thường trực. Số đo identity là hot
loop synthetic, không phải tốc độ toàn extension. MP3 mono 32 kbps thu 10 phút
khoảng 2,4 MB trước framing, so với 7,2 MB cho 30 phút; base64 thêm khoảng 1/3.
Đây là giảm trần phần thu, không áp dụng cho mọi file WAV hay tổng RAM browser.

Không đo độ trễ/chất lượng OpenAI thật; không quy đổi kernel thành mức tăng FPS
hoặc tốc độ model. Model, giọng, rate và hai-job/sáu-cue/16 MiB playback bounds
giữ nguyên; không giảm chất lượng PCM/bitrate để tạo số đẹp.

## Việc còn đáng làm

1. MP3 encoder vẫn chạy trên luồng của content script. Ưu tiên tiếp theo là
   worker riêng có queue/backpressure/cancel hữu hạn, sau khi đo long tasks trên
   máy yếu. Chưa thay bằng worker hoặc AudioWorklet trong a.6.
2. Phân tích theo các phần 10 phút của video dài cần UX riêng, timestamp/caption
   offset và speaker continuity giữa phần. Chưa tự chia, tự thu tiếp hay tính
   phí thêm; hiện video/audio tổng dài hơn 10 phút bị từ chối.
3. Cần video thật và API thật để đo p50/p95 thời gian chuẩn bị, lỗi speaker và
   độ khớp giọng. Fixture với API mock chỉ chứng minh pipeline/ownership/cache.

Không thêm permission, endpoint ngoài OpenAI, migration, DB/config/ZIP schema,
không upload PDF. Native CC, bộ đệm dịch hai phút và lựa chọn model giữ nguyên.

## Kiểm thử bản phát hành

- Full suite: **4.670 pass, 1 skip chủ đích**, SKIP_FREE_API=true; 67 test trực
  tiếp cho dubbing/preparation và background/provider. Kiểm cả 600/601 giây,
  metadata file trước đọc byte, sample cap thực, bỏ cache khi chọn file khác,
  thay owner/config/profile, startup đang phát và encoder-flush failure cleanup.
- **38 kiểm tra production Chrome**: 19 YouTube và 19 ani.pm, cả hai chạy capture
  thật/MP3 encode thật trên video tổng hợp đang phát 20 giây, API/model giả lập;
  phục hồi vị trí/tốc độ/pause, volume/offset/cache/context/giọng và route guards.
- Lint/type-check/format, build Edge ZIP và audit 201 runtime script đạt.
- Chưa đo peak OS RAM, FPS, máy yếu hoặc OpenAI thật; worker và phân tích video
  dài theo phần chưa triển khai. Không có blocker kiểm thử cục bộ còn mở.
- Bằng chứng: `.codex/dubbing-a6-tests.log`, `.codex/dubbing-a6-build.log`,
  `.codex/video-dubbing-anipm-1794713643354/evidence.json`,
  `.codex/video-dubbing-youtube-1794713724785/evidence.json`.
