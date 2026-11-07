# Khung song ngữ HTML — hợp đồng F21

Thêm trên baseline `c7f863f7` (PDF song ngữ F20). Release `1.58.0-a.23`,
manifest `1.58.0.24` / `1.58.0A`. Giữ F01–F20 khi merge upstream tiếp theo.
Không thay config124, schema DB/cache hoặc các ZIP đã phát hành.

## Cách dùng

- Trên bài báo HTML, popup extension → **Khung song ngữ HTML**; hoặc rê vào
  logo nổi rồi bấm biểu tượng hai cột cùng tên.
- Bấm **Translate page** trong popup, logo nổi hoặc khung. Engine vẫn dịch
  trên trang như trước; khung bên phải hiện các cặp đoạn gốc/bản dịch đã xong.
  Có thể mở khung sau khi đã dịch; không phải dịch lại chỉ để mở khung.
- Bấm **Đoạn N · Đến đoạn trên trang** để đối chiếu/tô sáng. Đoạn đang chọn
  có Copy, loa nguồn/dịch, MP3 nếu TTS đang chọn OpenAI và nút Luyện nghe /
  Lưu đoạn vào Reading Lab. Không tự phát/tải audio khi mở khung hoặc dịch.
- **Cuộn cùng nhau** mặc định bật: cuộn trang cập nhật khung, cuộn khung
  bằng chuột/bàn phím cập nhật trang. Chọn đoạn là thao tác nhảy rõ ràng,
  vẫn dùng được khi tắt cuộn tự động. Chọn chữ/copy/link của trang giữ nguyên.
- Khung cố định, không tự biến mất khi bấm bên ngoài. Có **Thu gọn**, **Mở
  rộng**, **Đóng**. Chừa chỗ bên phải mặc định trên màn hình rộng; bỏ chọn
  nếu bố cục site không phù hợp. Màn hình hẹp dùng khung ở nửa dưới, không
  ép bài báo hẹp lại. Đây là responsive layout, không khẳng định Edge trên
  điện thoại hỗ trợ cài extension desktop.
- Chế độ **chỉ bản dịch** cũng có các cặp trong khung: trang hiển thị ngôn
  ngữ đích, khung giữ đoạn gốc đã chụp trước khi engine đổi text.
  **Hiện bản gốc** dừng dịch, khôi phục DOM và xóa các cặp khỏi khung.

Ngôn ngữ/prompt/glossary/model theo Translate page hiện tại. Khung không có
luồng dịch hay bộ chọn ngôn ngữ thứ hai; đổi cấu hình rồi dịch lại trang để
áp dụng vào nội dung đã dịch. Nút trong khung là cùng toggle của engine,
không phải một bản sao queue/API.

## Dùng chung engine, không dịch hai lần

- Capture chữ gốc trước request; ghi cặp **chỉ lúc engine thực sự commit
  kết quả vào DOM**. Bilingual thường/virtual paragraphs, translation-only
  in-place swap và fallback dùng cùng pipeline gốc. Không đổi segmentation,
  HTML/inline-atom protection, glossary, prompt, batch, cache, streaming,
  retry hoặc cancellation. Chỉ thêm callback đọc kết quả và metadata RAM.
- Mở/đóng/thu gọn/mở rộng khung không gọi translator, không enqueue riêng.
  Engine có thể dịch tiếp các đoạn mới được nhìn thấy khi cuộn/resize theo
  preload hiện có; điều này không phải dịch lại đoạn để phục vụ khung.
- Khung render **text thuần từ nội dung đã commit**, không chèn provider HTML
  vào React, không parse tài liệu lần hai và không sửa/reparent nguồn. Các
  link, ảnh, sự kiện của bài báo vẫn do trang và engine gốc quản lý.
- Tô sáng là overlay trong Shadow DOM, pointer-events:none; đo Range của
  source text để tránh đánh dấu cả bản dịch phía sau. Với virtual/fallback,
  vị trí đánh dấu là wrapper của đoạn tương ứng trên trang.
- Có chừa chỗ chỉ bằng stylesheet/class riêng trên root; không ghi đè rồi
  restore cả inline-style/innerHTML của site. Dọn đúng class/style thuộc tính
  năng khi thu gọn/đóng. Print không dành chỗ cho UI này.

## Trạng thái, giới hạn và lifecycle

- `WebBilingualPairs` giữ tối đa **400 cặp / 2 Mi ký tự nguồn+bản dịch** và
  30.000 weak references, không giữ DOM nguồn bị tháo bằng strong reference.
  Chụp tối đa 6.000 node và 20.000 ký tự/đoạn; output tối đa 60.000 ký tự.
  Nếu vượt giới hạn, báo trong khung; bản dịch trên trang không bị xóa/đổi.
- Không có DB/cache/backup/sync mới. Các cặp chỉ ở RAM của tab; reload mất
  view này và engine dùng lại cache gốc khi người dùng dịch tiếp. Các cặp bị
  loại vì giới hạn không được tự dịch lại để lấp khung. Có thể Hiện bản gốc
  rồi Translate page để dựng lại view qua pipeline/cache hiện có.
- Metadata yếu ghi text và parent mong đợi. Source/output bị sửa, tháo hoặc
  chuyển parent thì loại cặp, không gắn bản dịch cũ vào đoạn khác. Node còn
  sống đổi thứ tự vẫn được sắp theo DOM. Nếu engine carry một wrapper sang
  source copy giống hệt, rebind weak metadata và giữ ID cặp mà không gọi API.
  Đổi route/query tăng epoch, bỏ kết
  quả trả muộn của bài cũ; đổi fragment để nhảy mục vẫn là cùng bài.
- Global restore clear view trước khi tháo wrappers, tăng epoch để request
  cũ không phục hồi cặp. Guard của engine vẫn quyết định commit/cancel như
  trước. Không nhận partial/error/echo thành một bản dịch đã xong.
- Chỉ nhận kết quả main-frame HTML do engine tạo. Bỏ nav/footer/aside/form/
  input/editable controls khỏi view. Không tự quét iframe hoặc closed shadow
  roots; khả năng dịch cũ của engine với những nơi đó vẫn giữ nguyên.
- UI lazy-loaded khi mở. Đo vị trí chỉ các anchor đang intersect viewport;
  một rAF gộp các sự kiện scroll, chặn phản hồi từ cuộn lập trình và yêu cầu
  user intent cho cuộn khung. Hỗ trợ scroll container ở phía nguồn khi nhảy.
  Card memoized, chỉ đoạn đang chọn mount các controls TTS/library.
- Prune metadata bounded mỗi 750 ms khi tab visible và khi focus/visibility
  đổi; không thêm MutationObserver quét subtree toàn trang. Đóng/thu gọn dọn
  IntersectionObserver/listeners/frame/overlay/reserved-space; đóng khung
  không dừng dịch trang. Capture tạm của request hết cùng request gốc.
- Dùng nguyên private runtime/credential và TTS/MP3/Reading Lab đã có; không
  bổ sung prompt/provider payload hay dịch vụ hosted/cloud. URL dùng để
  chống kết quả bài cũ chỉ ở RAM của view, không tạo usage/settings log mới.

## Source và gate khi nâng cấp

- `src/utils/host/translate/web-bilingual-pairs.ts`: bounded readonly view,
  weak node/text/parent validity, order, route/restore epoch và Range geometry.
- `core/translation-modes.ts`: capture/commit tại bốn đường render thực tế;
  `core/translation-state.ts`: rebind khi engine carry wrapper qua source copy.
  `dom/translation-insertion.ts`: callback thêm content node; callback cũ
  vẫn nhận wrapper như trước. `dom/translation-cleanup.ts`: clear khi restore.
- `content-runtime/side/components/web-bilingual/{gate,view,link,style}`:
  lazy isolated UI, sync/highlight, reserve space và controls reuse.
- Popup `web-bilingual-button.tsx`, floating-button và typed message
  `openWebBilingualPanel` mở view trong tab HTML hiện hành; không tạo quyền
  provider mới hoặc chuyển text qua một transport mới.
- Unit `web-bilingual-pairs.test.ts`: chỉ ghi cặp đã commit, whitespace/inline
  text, dedup/order, restore/source mutation/route, weak detach và giới hạn.
  Giữ tests gốc translation modes, inline atoms, HTML attributes, swaps và
  mutations. Floating-button regression thêm control mới vào contract.
- `node scripts/debug/check-web-bilingual.mjs`: production Edge, HTML article
  fixture có rich text/link/image/counter/virtual prose, hai translation mode,
  reopen không request trùng, highlight/sync, minimize/close/narrow viewport,
  lazy-load/removal, cancel/SPA, MP3 thật và Reading Lab đúng cặp.
- Giữ `check-pdf-bilingual.mjs` và `check-pdf-reading.mjs` vì thay callback
  chung không được làm hỏng PDF/ảnh/TTS hiện có. Unit chạy SKIP_FREE_API=true.

Provider text/audio trong browser regression là **mô phỏng**; browser, engine,
DOM, cache và file tải là thật. Chưa dùng kết quả này để khẳng định chất lượng,
tốc độ hoặc giá API live, cũng chưa xác minh mọi site báo có đăng nhập/paywall.
Không có blocker triển khai. Vẫn theo site rules/range/skip của Translate page.

## Báo cáo build 07/11/2026

- **Đã sửa:** khung song ngữ main-frame HTML cùng Translate page, metadata
  nguồn/dịch dùng chung ở hai mode, highlight/cuộn liên kết, reserve/minimize/
  close, reuse TTS/MP3/thư viện. Giữ source snapshots, weak reference budgets,
  parent/route/restore guards và carry sang identical source copy.
- **Đã kiểm thử:** 7 test metadata mới; 9 test metadata + carry pipeline;
  production Edge `156.0.4314.58`: **26** assertion HTML, **33** PDF song ngữ
  và **80** PDF/ảnh cũ đạt. Screenshot desktop/390 px đã xem, MP3 thật giải mã
  bằng ffprobe (`mp3`, 1,056 giây từ audio fixture). Lazy/remove, cancel/late,
  SPA, hai mode, DOM identity/counter/copy và reopen không request trùng đạt.
  Evidence `.codex/web-bilingual-1794051694372/evidence.json` và các log
  `.codex/web-bilingual-{browser,pdf-regression,pdf-image-regression}.log`.
- **Chưa kiểm thử:** API text/voice live, mọi site báo/paywall/browser; native
  Save As picker không được drive, test profile tải thật vào thư mục tạm.
- **Bị chặn:** không có.

`ReadFrog-Edge-1.58.0A-HTML-Bilingual.zip`: **440 file / 8.964.887 byte**,
tăng **10.042 byte** so với ZIP PDF song ngữ trước. CRC và từng file khớp
build đã chạy regression, manifest `1.58.0.24` / `1.58.0A`, không sentinel key/
profile. HTML ôn từ giữ nguyên SHA-256
`a640c20d7aa510642dbda1dd59411e41c0660670ae2a97594d3654ab56aedb64`.
SHA-256 ZIP:
`9572806f7396a1ab33fdd19b906e579e8d97cc128db7f67e801becec233b2ce4`.
