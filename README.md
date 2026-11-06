# Read Frog — Edge / OpenAI text + OpenAI / Microsoft TTS

Fork local đã tích hợp tag upstream v1.58.0 tại
48dccd04cfdf8432994608215ccad6db329f952b, giữ các thay đổi riêng phát triển từ 1.57.0.
Giữ engine dịch trang, hai chế độ bilingual/translation-only, selection,
annotation, custom actions, streaming, queue, glossary và Microsoft TTS; có thêm
lựa chọn đọc bằng OpenAI.

Văn bản dùng OpenAI chính thức tại https://api.openai.com/v1/responses.
API key được nhập trong Options và lưu vào IndexedDB riêng tại thiết bị;
config, backup và export thông thường không chứa key. TTS Microsoft hoạt động
độc lập với key OpenAI, gồm voice tùy chỉnh, chia đoạn, cache và offscreen playback.

Các dịch vụ hosted Read Frog, tài khoản, Notebase, Google Drive sync,
telemetry, provider dịch khác và proxy mạng tổng quát đã được gỡ.
YouTube dùng lại engine và giao diện phụ đề nguyên bản: tải track CC từ YouTube,
dịch trước theo cửa sổ look-ahead, batch/cache, sidebar transcript, xuất SRT và đầy đủ
thiết lập hiển thị/style. Phần dịch và phân tích vẫn qua OpenAI hiện tại. Nút Read Frog
có trên watch, embed và Shorts như bản gốc; video cần có track phụ đề. Tạo phụ đề bằng
dịch vụ hosted của Read Frog không được khôi phục. Có thêm ani.pm qua track text
đã tải trong player Settlar, cùng Bilibili, Udemy/Business và edX từ upstream 1.58.0.

X/Twitter và Netflix đã được khôi phục theo tag upstream v1.58.0: logo/menu gốc,
đọc native TextTrack trên X và TTML qua MAIN-world bridge trên Netflix; dịch qua
OpenAI hiện có. Có tuỳ chọn tự dịch riêng cho từng site, mặc định tắt. Bộ đệm dịch
trước vẫn là 120 giây ở 1×. X cần track text có sẵn; Netflix có thể chọn track text
theo tiếng audio và khôi phục lựa chọn khi tắt như bản gốc. Xem
[X_NETFLIX_SUBTITLES.md](X_NETFLIX_SUBTITLES.md) và
[ANI_PM_SUBTITLES.md](ANI_PM_SUBTITLES.md) để bảo trì các adapter.

Tạo phụ đề từ âm thanh khi thiếu CC chưa được tích hợp. OpenAI có Speech-to-Text
và Realtime transcription; để dùng cho video cần thêm lấy âm thanh và đồng bộ
timeline. Không tự thu âm hoặc gọi dịch vụ nhận dạng giọng nói khi bật dịch CC.

## Sổ từ vựng và HTML ôn tập

Sau khi dịch một từ/cụm từ trên web hoặc PDF, bấm **Lưu để học** để OpenAI tạo
nghĩa theo câu, phiên âm, ví dụ và hai audio. Mở **Sổ từ** từ popup để quản lý,
ôn tập hoặc xuất một ZIP chứa cả dữ liệu/audio/tiến độ. HTML độc lập hỗ trợ
điện thoại và máy tính, ba kiểu thẻ lật/trắc nghiệm/gõ đáp án, học và nghe offline.
Có thể tạo nhiều sổ có tên, chọn sổ khi lưu từ, đổi tên và chuyển từ giữa sổ.
Mỗi sổ xuất ZIP riêng, giữ lịch ôn riêng; HTML mở lại trên cùng trình duyệt
không cần nhập lại mỗi lần. ZIP v3 nén audio MP3 và DEFLATE 9, giữ tên/ID sổ,
vẫn nhập được ZIP v1/v2 cũ. Cùng HTML tự giải nén và phát audio khi mở từ file
hoặc đặt trên server HTTP(S), không cần API giải nén hay CDN.
Xem [VOCABULARY_LEARNING.md](VOCABULARY_LEARNING.md) để dùng và bảo trì.

## Dịch đoạn bôi đen trong PDF trên Edge

Bôi đen văn bản trong trình đọc PDF của Edge, bấm chuột phải và chọn
Read Frog → Translate. Khi tài liệu không có content-script receiver, extension
mở cửa sổ kết quả, dùng lại giao diện dịch bôi đen trên web: chọn ngôn ngữ,
streaming, copy, đọc thành tiếng, xem vùng chọn và dịch lại. Chọn đoạn khác trong
cùng tab sẽ cập nhật cửa sổ đó; yêu cầu dịch cũ bị hủy.

Chỉ đoạn được chọn đi qua runtime OpenAI hiện có. Extension không tải lại hoặc
upload file PDF, không cần can thiệp vào canvas/text layer của trình đọc. Áp dụng
glossary chung; không áp dụng glossary theo website cho PDF. Vùng chọn tối đa
20.000 ký tự, lưu tạm trong storage.session, tách khỏi config/export. Dữ liệu được
xóa khi đóng cửa sổ kết quả hoặc tab nguồn; vùng chọn quá 30 phút không được dùng
lại và được dọn khi có yêu cầu tiếp theo. PDF scan không có text chưa được hỗ trợ
OCR.

## Đọc thành tiếng

Trong Text to Speech, chọn Microsoft hoặc OpenAI. Mặc định tiếp tục dùng Microsoft;
giọng theo ngôn ngữ, tốc độ, cao độ và âm lượng Microsoft được giữ nguyên khi đổi
dịch vụ. OpenAI dùng chung key riêng trên thiết bị, có model đọc riêng với 10 giọng,
tốc độ 0,25×–1,5×, phong cách đọc và nút nghe thử. Giọng do AI tạo; API được tính phí
vào tài khoản OpenAI khi bấm đọc/nghe thử. Các nút đọc trong web, custom actions và
cửa sổ dịch PDF dùng dịch vụ đã chọn.

Model OpenAI mặc định là `gpt-realtime-2.1-mini`: background tạo client secret ngắn
hạn tại endpoint OpenAI chính thức, nhận PCM 24 kHz qua WebSocket chính thức và
phát WAV qua offscreen hiện có. Key chính và client secret không gửi tới content
script, cấu hình hoặc export. Có lựa chọn `gpt-4o-mini-tts` dùng `/v1/audio/speech`
cho tới lịch dừng 06/01/2027; không tự đổi dịch vụ khi có lỗi. Xem
[OpenAI Realtime WebSocket](https://developers.openai.com/api/docs/guides/voice-websockets),
[Speech API](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create)
và [lịch ngừng hỗ trợ](https://developers.openai.com/api/docs/deprecations#2026-10-01-text-to-speech-models).

OpenAI TTS chia văn bản theo ranh giới UTF-8, tải trước đoạn tiếp theo, cache âm
thanh theo dịch vụ/model/giọng/tốc độ/phong cách và phiên bản credential. Bấm Dừng,
đóng cửa sổ hoặc bắt đầu lượt đọc mới sẽ hủy tổng hợp cũ; phản hồi trễ không phát
đè lượt mới. Migration v122 và import/export giữ lựa chọn TTS cùng cấu hình Microsoft.

## Chạy và đóng gói

Dùng Node 26.13+ và pnpm 12.16.1 theo package.json/lockfile.
Không cần backend, Google OAuth hoặc PostHog env.

```sh
pnpm install --frozen-lockfile
pnpm lint
SKIP_FREE_API=true pnpm test
pnpm build:edge
pnpm zip:edge
```

Trên PowerShell, đặt `$env:SKIP_FREE_API='true'` trước khi chạy test.
Trong Edge, mở trang Extensions, bật Developer mode và Load unpacked thư mục
`.output/edge-mv3`. Mở Options, lưu OpenAI key rồi Test connection.
Thiết lập giọng đọc tại Text to Speech.

Không đặt API key trong biến môi trường WXT_*_API_KEY khi build production.
Các override transport Microsoft sẵn có được mô tả trong .env.example;
giữ mặc định nếu không cần thay đổi transport.

## Dữ liệu cục bộ

Bootstrap v122 phải hoàn tất trước khi UI cho phép ghi config. Key OpenAI cũ
chỉ được tự kích hoạt khi xác định rõ endpoint chính thức. Key proxy hoặc
không rõ nguồn được giữ riêng và yêu cầu nhập lại. Xóa key tạo tombstone để
migration retry không khôi phục key đã xóa. Import, restore và reset config
không thay key hiện tại; chúng thay toàn bộ config canonical qua cùng write queue.

Backup đọc được được chuyển sang cấu trúc portable. Backup không đọc được
được giữ trong vùng recovery riêng trước khi bỏ bản public và có thông báo
trong Options. Import/export glossary bằng tay và Undo được giữ; chỉ xóa
snapshot base của dịch vụ cloud đã gỡ.

Icon/font được đóng gói, custom CSS bị lọc tài nguyên mạng trước khi chèn,
và layout HTML tiếp tục qua sanitizer của layout engine. Kiểm thử mock,
build, kiểm tra Edge thủ công và live API là các mức bằng chứng khác nhau.

## Bản quyền

Giữ license và attribution của dự án gốc. Xem LICENSE và THIRD_PARTY_NOTICES.md.
Tài liệu upstream còn lại trong readmes/ mô tả sản phẩm gốc và có thể khác fork này.

## 📜 Commercial License Grant

<img src="assets/tabbit.avif" alt="Tabbit" height="20" /> **Meituan Tabbit Browser Team**: Free license (at no cost) for closed-source commercial use, limited to v1.21.3 and earlier versions (commit [`724863f`](https://github.com/mengxi-ream/read-frog/commit/724863fdbc2d777766cada6c111235534ee03ca0)). Granted on March 3, 2026, 9:00 AM (Vancouver Time, UTC-8).

<div align="right">

[![Back to top][back-to-top]](#readme-top)

</div>
