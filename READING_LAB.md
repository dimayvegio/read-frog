# Luyện nghe xen kẽ, thư viện đoạn đọc và shadowing

Tính năng riêng **F19**, từ package `1.58.0-a.21`, manifest numeric
`1.58.0.22`, tên hiển thị **1.58.0A**. Phát triển trên HEAD `9ad04eec` của
`codex/pdf-reading-panel`; giữ nguyên các hợp đồng F01–F18. Đây là ba phần người
dùng đã duyệt: nghe nguồn → dịch, lưu đoạn đọc và tự thu giọng để đối chiếu.

Từ build `1.58.0.25` có luồng **F22 — Luyện phát âm Mỹ** riêng ở Translate/
Dictionary: [AMERICAN_PRONUNCIATION.md](AMERICAN_PRONUNCIATION.md). Chỉ nút chấm
trong khung đó gửi bản thu mới tới OpenAI. Bản shadowing trong F19 vẫn local,
không bị upload hoặc tự chuyển thành điểm khi mở thư viện.

## Cách mở và sử dụng

Bôi đen trên web/PDF/ảnh → Translate → **Luyện nghe / Lưu đoạn**. Khung kết quả
PDF/ảnh dùng chung nút đó với web. Có thể mở trang trống qua popup extension →
**Luyện nghe & Thư viện đoạn đọc**, rồi dán văn bản gốc và bản dịch.

1. Kiểm tra các cặp câu. Mặc định chia câu trên máy theo thứ tự; câu ngắn hoàn
   chỉnh được giữ riêng. Nếu số câu hai bên khác nhau thì giữ nguyên cả đoạn
   thành một cặp để không bỏ mất chữ. Bấm **Ghép câu bằng AI** khi cần ghép lại
   theo nghĩa; AI chỉ chọn ranh giới trên câu có sẵn, không viết lại bản dịch.
2. Chọn khoảng nghỉ 0–10 giây, lặp câu gốc 1–3 lần và có/không đọc bản dịch.
   Bấm **Tạo audio OpenAI**. Audio mới dùng model/giọng/tốc độ/style hiện có trong
   Text to Speech; thao tác này có thể tính phí API. Không tự đổi provider chung.
3. **Nghe toàn bài** chạy đúng thứ tự lặp câu gốc → nghỉ → dịch → nghỉ → câu
   tiếp theo. Có tạm dừng/tiếp tục và Dừng. **Tải MP3 xen kẽ** ghép theo cùng
   thiết lập, làm trên máy và không gọi thêm API. MP3 có thể chép sang điện thoại.
4. Đặt tên, chọn thư mục/yêu thích rồi **Lưu đoạn**. Nội dung và audio mới tạo
   chỉ được giữ sau khi bấm lưu. Thư viện có tìm kiếm, lọc thư mục/yêu thích,
   đổi tên qua mở bài, xóa và xuất nhiều ZIP bằng cách chọn các đoạn khác nhau.
5. **Luyện câu này → Nghe mẫu → Thu giọng của tôi → Dừng thu → Nghe mẫu →
   giọng của tôi**. Edge hỏi quyền micro khi cần. Có thu lại/bỏ bản thu; lưu đoạn
   để giữ bản thu. Đây là tự nghe đối chiếu, không có chấm điểm phát âm tự động.

Bài nghe dùng nguồn/bản dịch được chuyển vào, nên dùng được cả ngôn ngữ khác
ngoài Anh–Việt. Trang mới có bố cục co về một cột ở chiều rộng điện thoại; bản
này là trang của extension desktop, không phải HTML ôn từ độc lập trên điện thoại.
Thiết lập khoảng nghỉ/lặp là trạng thái phiên hiện tại; nội dung/audio được lưu.

## Lưu dữ liệu và ZIP

- IndexedDB riêng `read-frog-reading-library`, **DB1** với `passages`, `folders`,
  `assets`, `meta`. Chỉ origin extension đọc/ghi; không đụng credential/config,
  vocabulary, PDF/image/usage DB hoặc Edge account sync.
- Giữ tối đa 100 đoạn / 256 MiB, 50 thư mục; mỗi bên 20.000 ký tự, tối đa120
  cặp câu. Mỗi asset tối đa8 MiB và mỗi đoạn tối đa64 MiB audio. Không âm thầm
  đẩy mất đoạn của người dùng khi đầy. Thu micro tối đa60 giây/lần.
- Audio mẫu nén MP3 mono64 kbps; bản thu giữ container browser hỗ trợ (Edge dùng
  WebM/Opus). Asset dùng SHA256 để deduplicate. Chỉ dọn audio không còn đoạn nào
  tham chiếu; cập nhật/xóa có transaction, revision và epoch để chặn lưu đè cũ.
  Profile giọng lưu trong ZIP là metadata độc lập với danh sách model runtime:
  model ngừng hỗ trợ vẫn phải đọc được audio cũ, và không được chạy profile từ
  ZIP thành yêu cầu provider. Tạo audio mới chỉ dùng cấu hình hiện tại đã xác thực.
- ZIP **reading-library v1**: `manifest.json` và `audio/<sha256>`, DEFLATE9,
  tổng sau giải nén tối đa64 MiB. Khác định dạng ZIP Sổ từ; không thêm dữ liệu
  vào vocabulary ZIP6/report3. JSON giữ title/folder/favorite/text/cặp câu và
  profile giọng công khai; không có API key, screenshot hoặc toàn bộ settings.
- **Mặc định không xuất bản thu của người dùng.** Chỉ kèm khi đánh dấu checkbox
  tương ứng. ZIP xuất các đoạn đã lưu, không lấy những chỉnh sửa/bản thu chưa lưu.
  MP3 nguồn/đích và bản dịch đã lưu vẫn nghe được sau khi tắt mạng/xóa API key.
- Import xác thực tên file, ZIP32/flags/size/CRC, kích thước giải nén thực, JSON,
  hash và header audio trước transaction. Import trùng passage ID **giữ bản local**
  và bỏ qua bản trong ZIP, không ghi đè tiến trình/chỉnh sửa. Thư mục khớp theo tên.
  Lỗi/quá quota rollback toàn bộ; không import một nửa.

## Hợp đồng phải giữ khi nâng cấp upstream

- Đọc [FORK_DIFFERENCES.md](FORK_DIFFERENCES.md),
  [UPSTREAM_UPGRADE_GUIDE.md](UPSTREAM_UPGRADE_GUIDE.md) và giữ **F19**. DB1/ZIP1
  khi đã phát hành là schema đóng băng; mở rộng bằng version mới. Không sửa các
  migration config/vocabulary/PDF đã phát hành để tiện ghép chức năng này.
- Nút ở `translation-content.tsx` dùng RPC mở trang riêng. Capture text ở memory
  background, một lần dùng/TTL10 phút/tối đa10 mục; chỉ trang lab top-level của
  cùng extension được consume. URL chỉ chứa opaque channel, không chứa đoạn văn.
  Worker restart có thể làm mất capture; UI cho dán lại, không dựng text giả.
- AI port `reading-lab-alignment` chỉ nhận đúng trang lab; parse strict và
  timeout90 giây. Payload provider chỉ có câu và chỉ số, không có title/file path,
  URL tài liệu hoặc credential. Cache ranh giới trong memory tối đa10 kết quả,
  theo prompt/profile/credential revision/text; đổi key/config hủy kết quả cũ.
- Tạo audio dùng private `openai-tts-file` và cache chung theo text/profile/key;
  không claim/Stop playback TTS cũ, không ảnh hưởng sinh audio từ vựng. Bài lưu
  giữ profile giọng đã tạo; nút tạo lại theo giọng mới là thao tác riêng rõ ràng.
- Player của trang lab và các bản thu chỉ phát sau click, một chuỗi mỗi trang;
  không tự chơi khi mở/import. Pause trước khi metadata audio tải xong vẫn phải
  tiếp tục cùng chuỗi. Thu micro dừng audio mẫu/preview trước; stop/unmount/pagehide
  dọn tracks, handlers, timers và object URLs. Permission trả muộn không giữ micro.
- Lượt hủy/đóng trang không áp audio sinh muộn vào bài khác. Lưu luôn kiểm tra
  revision và epoch của DB, không tự phục hồi bài bị xóa. Tác vụ đang dở chỉ ở
  memory; người dùng chủ động lưu những gì cần giữ.
- Export MP3 dùng lại audio đã tạo, giải mã/nén lại trên máy với giới hạn nguồn
  128 MiB/MP3 32 MiB. Đọc frame duration trước khi decode audio import. Không đổi
  đuôi file hoặc nối header; giữ đủ repeats/gaps và không đưa bản thu vào MP3 bài.
- Giọng thu không gửi OpenAI hoặc dịch vụ nào. Không thêm STT/chấm điểm mà không
  có UI và thao tác riêng. Không coi thu âm/nghe lại là trả lời đúng/sai của từ;
  không tác động logs/SRS/report của sổ từ.

Source chính: `src/entrypoints/reading-lab/`, `src/utils/reading-library/`,
`src/entrypoints/background/reading-lab.ts`,
`src/components/ui/selection-popover/reading-lab-button.tsx`.

## Kiểm chứng và giới hạn

Chạy `SKIP_FREE_API=true pnpm exec vitest run` và
`node scripts/debug/check-reading-lab.mjs` sau `pnpm zip:edge`. Browser regression
dùng Edge profile mới, Responses/Speech fixture và micro giả lập của trình duyệt.
Nó kiểm tra luồng chọn đoạn, AI boundaries, audio, pause/resume, duration MP3 qua
ffprobe, persistence, offline, folder/search/favorite, record/compare, nhập/xuất
ZIP mặc định/kèm bản thu, import trùng và viewport390px. Không dùng API key thật.

API/giọng OpenAI thật, micro vật lý, hộp thoại quyền theo policy trên máy người
dùng và điện thoại thật cần báo riêng; dữ liệu fixture không chứng minh các mục
đó. Khi mở nhiều trang lab, mỗi trang có player riêng; playback offscreen TTS cũ
giữ nguyên. Không có sync thư viện lên Drive/OneDrive trong bản này.

API browser: [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia),
[MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder).

### Báo cáo bàn giao — 07/11/2026

- **Đã sửa:** đủ ba chức năng F19, nút mở từ kết quả Translate/popup, thư viện
  bền vững, ZIP có/không bản thu, controls và MP3 xen kẽ, ghi âm/đối chiếu,
  cleanup/cancel và tài liệu giữ tính năng khi merge upstream. Không thay DB,
  schema config, vocabulary ZIP/report hoặc credential của bản cũ.
- **Đã kiểm thử:** 19 test môđun mới về segmentation/index validation,
  capture/sender, generation/cancel/key revision, transactions/CAS/epoch/GC,
  ZIP/CRC/size/hash/legacy speech metadata, player và recorder. Lint/typecheck,
  format và ZIP build đạt. Full-suite bắt buộc chạy với `SKIP_FREE_API=true`
  trước push; free API live được bỏ qua theo hướng dẫn repo.
- **Đã kiểm thử trên Edge:** 20 assertions tại
  `.codex/reading-lab-1794045870496/evidence.json`, browser
  `Edg/156.0.4314.58`. MP3 thực có sáu clip và năm khoảng nghỉ1 giây, ffprobe
  đo11,4 giây (gồm padding MP3). Có ảnh desktop/viewport390px, persistence,
  offline, micro giả lập và khôi phục ZIP vào DB trống. Metadata model cũ được
  kiểm thử thêm bằng unit sau lần browser này.
- **Chưa kiểm thử:** OpenAI API/giọng thật, micro vật lý/quyền theo policy trên
  máy người dùng và điện thoại thật. Không suy diễn tốc độ/chi phí model từ
  fixture; không có chấm điểm phát âm hoặc đồng bộ cloud trong bản này.
- **Bị chặn:** không có. Các giới hạn dung lượng và thao tác lưu chủ động nêu
  trên là phạm vi đã triển khai.
