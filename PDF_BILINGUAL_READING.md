# PDF song ngữ theo đoạn — hợp đồng F20

Bổ sung trên baseline local `3c53f11d`, package `1.58.0-a.22`, manifest
`1.58.0.23` / `1.58.0A`. Đây là chức năng riêng của fork, cần giữ khi nhận
upstream mới cùng F01–F19. Không nâng config124 hoặc các DB/ZIP đã phát hành.

## Cách sử dụng

1. Popup extension → **PDF** → **Đọc PDF và tự lưu vị trí**.
2. **Mở PDF trên máy**, chọn file rồi bật **Song ngữ theo đoạn**.
3. Bản PDF gốc ở bên trái, các đoạn tương ứng của **trang hiện tại** ở bên
   phải. Chọn ngôn ngữ trong đầu khung dịch; English và Vietnamese đứng đầu.
4. Bấm **Dịch đoạn** hoặc **Dịch trang đang xem**. Trang được dịch tuần tự,
   đoạn hoàn thành hiện ngay. **Dừng dịch**, đổi trang/file hoặc tắt chế độ
   sẽ hủy công việc còn lại; các đoạn hoàn thành vẫn ở cache.
5. Bấm số đoạn để đối chiếu hai bên. **Cuộn cùng nhau** bật mặc định; có thể
   tắt để cuộn độc lập. Cuộn hết khung dịch rồi cuộn tiếp chuyển sang trang
   tiếp/trước khi còn trang tương ứng.
6. Sau khi dịch có Copy, loa theo Microsoft/OpenAI đã chọn, tải MP3 khi dùng
   OpenAI và nút mở Luyện nghe / Lưu đoạn vào thư viện. Mở **Đoạn gốc** để
   copy/nghe/tải MP3 nguồn. Không tự phát audio hoặc tải file khi dịch xong.

Đây là bố cục trong **trình đọc Read Frog**, không thay giao diện PDF mặc
định của Edge. Native PDF vẫn dùng menu dịch bôi đen/khung cố định hiện có.
Trong reader mới vẫn có thể bôi đen, copy và **Dịch đoạn đã chọn** để chuyển
về giao diện vùng chọn cũ. Màn hình hẹp xếp bản gốc phía trên, bản dịch phía
dưới. File vẫn phải chọn lại trong phiên mới vì extension không lưu bản sao.

## Nhận diện, đối chiếu và tài nguyên

- Lấy hình học từ các span lớp chữ PDF.js **đã render trên máy**, không gọi
  OpenAI để phân tích bố cục, không trích toàn tài liệu khi bật chế độ.
- Ghép các mảnh cùng dòng rồi ghép dòng theo khoảng cách, cỡ chữ và thụt
  dòng. Giữ tiêu đề/cỡ chữ khác và đầu danh sách riêng; nhận diện hai cột cơ
  bản khi có ít nhất ba hàng tương ứng mỗi bên. Dòng gốc được giữ trong
  đoạn; đường làm sạch PDF bảo thủ hiện có chuẩn bị text trước khi dịch.
- ID đoạn dựa vào trang, thứ tự và nội dung NFC, độc lập với tọa độ/zoom.
  Tô sáng bằng overlay riêng, không sửa canvas hoặc text DOM của PDF.js.
  Overlay không chặn chọn chữ; chỉ badge số đoạn nhận pointer.
- Điểm đọc ở 15% chiều cao mỗi khung. Cuộn hai chiều ánh xạ đoạn và tỷ lệ
  trong đoạn, có chặn phản hồi từ cuộn lập trình. Chọn cột phải giữ ưu tiên
  cột đến khi chuyển trang. `pageAtOffset` dung sai 0,5 CSS pixel xử lý
  scrollTop bị làm tròn ở màn hình/zoom có pixel lẻ.
- Giữ tối đa ba canvas/text layer như reader trước. Chỉ lớp chữ của các
  trang đang có lease mới được đo; evict lease dọn overlay/hình học tương
  ứng. Scan yield mỗi 250 span và có generation/token/disconnect guards.
- Chặn quá 6.000 span, 120 đoạn, 100.000 ký tự/trang hoặc 20.000 ký tự/đoạn;
  báo dùng bôi đen/chụp vùng, không âm thầm cắt nội dung. Kết quả tối đa
  60.000 ký tự/đoạn; session giữ tối đa 5 trang và 2 Mi ký tự gồm text hiển
  thị/bản hoàn thành. Hủy mọi observer/listener/frame/queue khi đóng.

Đây là heuristic, **không bảo đảm mọi bảng/công thức, chữ xoay/dọc hoặc bố
cục nhiều cột phức tạp**. Đoạn xuống dòng liên tục, cùng cỡ chữ và thụt dòng
có thể bị ghép; kiểm tra **Đoạn gốc**, dùng chọn chữ khi cần chính xác. Trang
scan/không có lớp chữ báo dùng **Chụp vùng & dịch ảnh** hiện có. Chế độ này
không tự OCR toàn trang.

## API, dữ liệu và cache

- Bật, cuộn, zoom, đổi file/ngôn ngữ hoặc khôi phục cache **không tự gọi API
  dịch**. `translateNativeSelection({cacheOnly:true})` dừng ngay sau lookup,
  kể cả cache miss/lỗi. Chỉ thao tác Dịch đoạn/trang/Dịch lại mới cho phép
  gọi model. Mỗi trang là một queue tuần tự; bấm lặp không tạo queue trùng.
  Có thể có một request riêng cho mỗi đoạn chưa có cache.
- Dùng lại private OpenAI runtime, streaming, glossary toàn cục, prompt và
  ngôn ngữ đích rõ ràng của dịch PDF. Chỉ text các đoạn được yêu cầu vào
  provider payload, không filename, đường dẫn, PDF bytes hoặc document ID.
- Dùng DB PDF v2 hiện có với `documents/translations/meta`; không sửa schema
  v1/v2. Cache dùng ID nội dung file và identity chuẩn bị text/prompt/glossary/
  model/credential revision/target như vùng chọn. Hai trang có đoạn giống
  nhau có thể dùng lại bản dịch đó. Đổi tên cùng nội dung vẫn dùng cùng cache.
- Cache-only restore không được biến thành request trả phí khi lookup lỗi.
  Kết quả hoàn thành có thể vẫn hiện khi cache đầy, nhưng phải báo chưa lưu.
  Giữ hạn mức 1.000 bản dịch / 32 MiB của PDF history, không tự xóa bản cũ.
- Context kiểm tra config, credential status/revision, glossary revision và
  clear epoch khi mở/focus và trước/sau dịch; key/epoch được kiểm tra mỗi
  5 giây khi trang visible. Đổi context remount session, hủy stream và xóa
  kết quả trong RAM. Bỏ qua tác vụ cache/context trả về sau khi bị hủy.
- Khi hủy/lỗi, không dùng text streaming dở cho TTS/lưu đoạn. Dịch lại hỏng
  vẫn giữ bản hoàn thành trước, báo lỗi và ngừng batch thay vì gọi tiếp.
- Không đổi lưu vị trí content-hash/page/scroll/zoom, cache clear-epoch,
  vocabulary/SRS, TTS độc lập hoặc Edge config sync. Hình học/đoạn tạm chỉ
  trong RAM; thư viện/audio vẫn chỉ lưu theo thao tác rõ ràng qua F19.

## Source và kiểm thử khi merge

- `src/entrypoints/pdf-reader/{paragraphs,paragraph-layer}.ts`: bố cục, overlay,
  liên kết với viewport; `viewport.ts`: lease, điều hướng, pixel rounding.
- `{bilingual-session.ts,bilingual-pane.tsx}`: cache-only restore, queue,
  cancellation/context, giao diện hai khung và reuse các controls hiện có.
- `app.tsx` giữ keyed `pdf-host` ổn định khi thêm/bỏ nhãn/khung dịch. Không
  để React thay DOM chứa canvas do viewport quản lý khi bật/tắt mode.
- `src/utils/selection-result/translate.ts`: thêm `cacheOnly` tùy chọn,
  caller cũ giữ hành vi; không mở rộng quyền truy cập credential.
- Unit `pdf-reader/__tests__/{paragraphs,bilingual-session}.test.ts` và
  `selection-result/__tests__/translate.test.ts`: bố cục/2 cột/zoom/giới hạn,
  opt-in/cache-only, queue/dedup/abort/context/cache failure/bounds.
- `node scripts/debug/check-pdf-bilingual.mjs`: chạy production build trong
  Edge profile riêng, PDF có lớp chữ thật và fixture trang trắng; test hai
  khung, cache/reload/đổi tên/target/key/clear, zoom, cancel/page/file,
  TTS/MP3 decode, mở Reading Lab và viewport 390 px. Audio và model trả lời
  được **mô phỏng**; file MP3, browser/render và cache là thật. Test bypass
  Save As chỉ trong profile tạm để không mở hộp thoại OS.
- Giữ production regression cũ:
  `$env:PDF_IMAGE_SKIP_BENCHMARK='1'; node scripts/debug/check-pdf-reading.mjs`.
  Test unit chạy với `SKIP_FREE_API=true`.

Không dùng thời gian mock làm tốc độ OpenAI live hoặc khẳng định đã thử mọi
PDF/ngôn ngữ. Chưa thử model/giọng thật và PDF cá nhân của người dùng trong
đợt này. Không có blocker triển khai; PDF scan dùng OCR riêng hiện có.

## Báo cáo bản build 07/11/2026

- **Đã sửa:** hai khung, ghép đoạn/tô sáng/cuộn liên kết, dịch trang/đoạn
  opt-in, cache-only và hủy tác vụ, reuse TTS/MP3/thư viện; sửa nhận trang
  tại zoom có pixel lẻ và giữ chọn đoạn sát đầu trang. Không đổi schema.
- **Đã kiểm thử:** 44 test nhóm PDF/selection; production Edge
  `156.0.4314.58` có 33 assertion song ngữ và 80 assertion PDF/ảnh cũ đạt.
  Kiểm tra screenshot desktop/390 px, MP3 bằng ffprobe, cache sau reload/
  đổi tên, context/epoch, hủy khi đổi trang/file và giới hạn ba canvas.
  Evidence local: `.codex/pdf-bilingual-1794049405813/evidence.json`;
  regression cũ ghi tại `.codex/pdf-bilingual-legacy-browser.log`.
- **Chưa kiểm thử:** OpenAI/Microsoft live, mọi bố cục PDF thật hoặc OS file/
  Save As picker bằng automation; browser dùng file input và tải thật vào
  thư mục tạm. Không suy ra tốc độ/chi phí model từ fixture.
- **Bị chặn:** không có.

Artifact `ReadFrog-Edge-1.58.0A-PDF-Bilingual.zip`: **437 file / 8.954.845
byte**, manifest `1.58.0.23` / `1.58.0A`, tăng 7.432 byte so với ZIP Reading
Lab trước. CRC và từng file khớp build chạy regression; không có sentinel
credential/profile. HTML ôn từ giữ nguyên SHA-256
`a640c20d7aa510642dbda1dd59411e41c0660670ae2a97594d3654ab56aedb64`.
SHA-256 ZIP:
`08a00f3e65d8d747b089c25bdff40ea04be92f952d63d0f215c3814a6085b28a`.
