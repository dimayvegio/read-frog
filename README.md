# Read Frog — Edge / OpenAI text + OpenAI / Microsoft TTS

Fork local đã tích hợp tag upstream v1.58.0 tại
48dccd04cfdf8432994608215ccad6db329f952b, giữ các thay đổi riêng phát triển từ 1.57.0.
Giữ engine dịch trang, hai chế độ bilingual/translation-only, selection,
annotation, custom actions, streaming, queue, glossary và Microsoft TTS; có thêm
lựa chọn đọc bằng OpenAI.

Bản source hiện tại là **1.58.0A** (`1.58.0-a.18` / manifest `1.58.0.19`).
Để nâng cấp upstream tiếp mà giữ tính năng riêng, đọc
[bảng khác biệt và hợp đồng F01–F18](FORK_DIFFERENCES.md), rồi làm theo
[quy trình merge và kiểm thử](UPSTREAM_UPGRADE_GUIDE.md). Các tài liệu này
phân biệt tính năng thêm riêng, thay đổi dịch vụ có chủ ý và phần kế thừa từ
upstream; có source map, ledger dữ liệu và mẫu báo cáo cho bản nâng cấp sau.

Văn bản dùng OpenAI chính thức tại https://api.openai.com/v1/responses.
API key được nhập trong Options và lưu vào IndexedDB riêng tại thiết bị;
config, backup và export thông thường không chứa key. TTS Microsoft hoạt động
độc lập với key OpenAI, gồm voice tùy chỉnh, chia đoạn, cache và offscreen playback.

Các dịch vụ hosted Read Frog, tài khoản, Notebase, Google Drive sync,
telemetry, provider dịch khác và proxy mạng tổng quát đã được gỡ.
Popup → **Đồng bộ cấu hình Edge** dùng tài khoản trình duyệt, không cần Client ID.
Cấu hình được nén, có xử lý xung đột và backup/khôi phục. API key và dữ liệu học
vẫn giữ riêng trên máy; các máy cần cùng ID extension. Xem
[EDGE_SETTINGS_SYNC.md](EDGE_SETTINGS_SYNC.md). Nút Send feedback cũ đã được gỡ.
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

Sau khi dịch hoặc tra **Dictionary** một từ/cụm từ trên web/PDF, bấm **Lưu để học** để OpenAI tạo
nghĩa theo câu, phiên âm, ví dụ và hai audio. Mở **Sổ từ** từ popup để quản lý,
ôn tập hoặc xuất một ZIP chứa cả dữ liệu/audio/tiến độ. HTML độc lập hỗ trợ
điện thoại và máy tính, ba kiểu thẻ lật/trắc nghiệm/gõ đáp án, học và nghe offline.
Có thể tạo nhiều sổ có tên, chọn sổ khi lưu từ, đổi tên và chuyển từ giữa sổ.
Mỗi sổ xuất ZIP riêng, giữ lịch ôn riêng; HTML mở lại trên cùng trình duyệt
không cần nhập lại mỗi lần. ZIP nén audio MP3 và DEFLATE 9, giữ tên/ID sổ,
vẫn nhập được ZIP v1/v2 cũ. Cùng HTML tự giải nén và phát audio khi mở từ file
hoặc đặt trên server HTTP(S), không cần API giải nén hay CDN.
Tab **Nhật ký** thống kê từ/lượt đã kiểm tra, đúng/sai, thời gian phản hồi và
từ cần ôn thêm. **Tải báo cáo ngắn cho ChatGPT** xuất file Markdown với danh sách từ
cần ôn, lý do và câu trả lời sai/đáp án; JSON v3 giữ thêm toàn bộ dữ liệu thô.
Sổ lớn có bảng tiến trình gọn cho từng từ, không nhét toàn bộ log vào Markdown.
**Học hôm nay** và luyện riêng hỗ trợ gõ nhiều vòng, gõ sửa lỗi, gợi ý,
nghe và gõ, điền từ trong câu; tiếp tục buổi đang dở trên cùng trình duyệt.
Gợi ý/dán đáp án/gõ sửa không tăng số lần tự nhớ đúng. Mỗi lượt tối đa 10 từ.
Tách từ đang củng cố, có dấu hiệu nhớ và chưa đủ dữ liệu. ZIP v6 mang theo nhật ký
và nhiều câu nguồn cho mỗi từ, vẫn nhập được v1–v5. Nhật ký bắt đầu ghi từ bản mới,
không suy diễn kết quả đúng/sai từ lịch ôn cũ; thẻ lật được tính là tự đánh giá.
Xem [VOCABULARY_LEARNING.md](VOCABULARY_LEARNING.md) để dùng và bảo trì.

Từ trong sổ đang chọn được tô trên web, PDF Read Frog và phụ đề theo tiến trình
đã kiểm tra; bấm để xem nghĩa local trước. **Thêm câu vào từ đã có** giữ nhiều
ngữ cảnh, trang PDF/mốc video mà không tạo lại audio. YouTube → **Learning** có
**Luyện nghe từng câu**, J/K/L, lặp 1–3 lần, tự dừng và ẩn/hiện bản dịch; mặc định
tắt. Bật chế độ này mới dùng OpenAI chia lại CC thành câu; chỉ gửi từng cửa sổ
quanh vị trí xem, có cache/cancel và nhãn timing ước lượng khi thiếu word timing.
Câu AI hiện trong khung Learning, track overlay/transcript thường vẫn riêng.
Khung Learning kéo được cả khung, đổi chiều ngang/dọc từ cạnh/góc, nhớ local,
có keyboard/reset và đi theo fullscreen. Popup → **Chi phí và tốc độ OpenAI** xem token thật, độ trễ, chi phí ước tính,
cache và cảnh báo ngân sách trên máy. Xem [STUDY_FLOW_AND_USAGE.md](STUDY_FLOW_AND_USAGE.md).

## Dịch đoạn bôi đen trong PDF trên Edge

Popup có **Chụp vùng & dịch ảnh**: chụp → kéo chọn vùng → **Đọc chữ và dịch**.
Phím tắt gợi ý **Alt+Shift+S**, đổi tại `edge://extensions/shortcuts`.
Chế độ **Nhanh — một lượt** nhận cả chữ và bản dịch trong một request;
glossary/prompt riêng vẫn dùng hai bước. Cache chữ/bản dịch giúp ảnh trùng
không cần gọi API lại; **Đọc lại ảnh** bỏ qua cache, **Xóa cache ảnh** xóa riêng
bộ nhớ đệm này. Không lưu ảnh vào cache.
Trình đọc PDF cũng có nút này để dịch trang scan. Có thể dùng Win+Shift+S rồi
**Dán / mở ảnh có sẵn → Ctrl+V**, hoặc mở ảnh PNG/JPEG/WebP. OpenAI đọc chữ,
sau đó dùng cùng khung dịch/copy/TTS/lưu từ; có ô sửa chữ nhận dạng.
Xem [IMAGE_TRANSLATION.md](IMAGE_TRANSLATION.md).

PDF local có sidebar cố định, làm sạch dòng và lịch sử/cache theo tài liệu.
Bấm **PDF** trong popup → **Đọc PDF và tự lưu vị trí**, rồi mở PDF trên máy.
Trình đọc Read Frog tự nhớ trang, vị trí cuộn và thu phóng; mở lại cùng nội dung
file (kể cả đổi tên) sẽ tự khôi phục. File được đọc trên máy, không upload.
Tự nhớ vị trí chỉ hoạt động trong trình đọc Read Frog; Edge native vẫn dùng được
luồng dịch vùng chọn bên dưới. Không lưu bản sao PDF, nên phiên mới có thể cần
chọn lại file. Không cần thay HTML ôn từ.

Bấm **PDF** trong popup để mở khung, rồi chọn đoạn → Read Frog → Translate hoặc
**Dịch trong khung cố định (PDF)**. Xem/tải JSON/xóa lịch sử riêng từng file;
chọn lại đoạn trùng dùng bản lưu, Regenerate chủ động dịch mới. Xem
[PDF_LOCAL_READING.md](PDF_LOCAL_READING.md) để dùng và bảo trì.

Bôi đen văn bản trong trình đọc PDF của Edge, bấm chuột phải và chọn
Read Frog → Translate. Khi tài liệu không có content-script receiver, extension
mở khung PDF hoặc cửa sổ kết quả dự phòng, dùng lại giao diện dịch bôi đen trên web: chọn ngôn ngữ,
streaming, copy, đọc thành tiếng, xem vùng chọn và dịch lại. Chọn đoạn khác trong
cùng tab sẽ cập nhật cửa sổ đó; yêu cầu dịch cũ bị hủy.

Chỉ đoạn được chọn đi qua runtime OpenAI hiện có. Extension không tải lại hoặc
upload file PDF, không cần can thiệp vào canvas/text layer của trình đọc. Áp dụng
glossary chung; không áp dụng glossary theo website cho PDF. Vùng chọn tối đa
20.000 ký tự, lưu tạm trong storage.session, tách khỏi config/export. Dữ liệu được
xóa khi đóng cửa sổ kết quả hoặc tab nguồn; vùng chọn quá 30 phút không được dùng
lại và được dọn khi có yêu cầu tiếp theo. PDF scan không có text copy được dùng
**Chụp vùng & dịch ảnh** để OCR phần đã chọn; không tự OCR hoặc upload toàn file.

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

Bootstrap theo schema fork hiện tại **124** phải hoàn tất trước khi UI cho phép ghi config. Key OpenAI cũ
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
