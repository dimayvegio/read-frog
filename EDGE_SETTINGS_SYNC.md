# Đồng bộ cấu hình qua Edge — 1.58.0-a.16

**Cập nhật 1.59.1A:** writer mới dùng transport2/config125 cho BCP47; reader
nhận nguyên bản transport1/config124, kiểm checksum raw rồi migrate. Giữ nguyên
head-last, limits, vector clocks, lựa chọn conflict, recovery/undo DB1 và exclusions.
Transport1 đã phát hành không bị sửa. Client1.58.x cần nâng cấp để đọc snapshot2.
Nếu không còn snapshot legacy của base hash thì báo conflict bảo thủ, không tự
đè local. Các mô tả transport1/config124 bên dưới là snapshot bản1.58.0.
Chi tiết: [UPSTREAM_1_59_1_REPORT.md](UPSTREAM_1_59_1_REPORT.md).

Tiếp tục từ `7cbdc3ce` (bốn phần học/từ vựng/usage đã hoàn tất và push trước).
Package `1.58.0-a.16`, manifest numeric `1.58.0.17`, tên hiển thị **1.58.0A**.
Theo lựa chọn của người dùng: dùng `storage.sync` của tài khoản Edge, không dùng
OAuth OneDrive/Google Drive, Client ID, Azure hoặc máy chủ trung gian.

## Sử dụng

1. Popup → **Đồng bộ cấu hình Edge**, hoặc Preferences → quản lý cấu hình.
2. Đăng nhập cùng tài khoản trong Edge trên các máy, bật sync **Extensions**.
3. Đối chiếu **ID extension** hiển thị trên trang rồi bật đồng bộ trên từng máy.
   Giữ nguyên thư mục khi cập nhật ZIP. Bản unpacked lấy ID theo đường dẫn nếu
   manifest không có key; đường dẫn khác có thể thành ID khác và kho sync khác.
   Bản này không đổi manifest key hoặc ID của bản đang cài. Khi cài máy khác,
   dùng cùng đường dẫn tuyệt đối và kiểm tra ID; không chỉ so tên/phiên bản.
4. Lần đầu có cấu hình khác, hoặc hai máy cùng sửa, chọn bản muốn dùng. Có tóm
   tắt model/ngôn ngữ và **Xem đầy đủ cấu hình trước khi chọn**. Preview xung đột
   không tự thay trong lúc đọc; **Tải lại** lấy bản mới. Lựa chọn cũ bị từ chối
   nếu cấu hình local hoặc snapshot remote đã đổi.
5. **Khôi phục cấu hình trước lần nhận** đưa về bản trước và tắt tự sync trên
   máy này. Bản đang thay thế cũng được backup. Nếu apply bị gián đoạn, journal
   giữ snapshot cũ và chặn auto-sync cho đến khi khôi phục hoặc giữ bản hiện tại.

Đồng bộ toàn bộ config public hiện có: ngôn ngữ, model/tham số, prompts,
style/CSS, TTS, shortcuts, site rules; thêm cờ `studyHighlightsEnabled` local.
**Không gồm API key, glossary rows, vocabulary/audio/progress/logs, PDF history,
ảnh/cache hoặc usage logs.** Các DB đó không được đọc/ghi bởi sync. Glossary và
sổ từ tiếp tục dùng file export/ZIP riêng. Không tự tạo tài khoản hoặc đổi model.

**Đã cập nhật kho Edge** nghĩa là API storage.sync đã nhận bản local, không phải
xác nhận máy khác đã nhận. Khi chưa đăng nhập/bật account sync hoặc offline,
API này có thể hoạt động như kho local. Không giả định ghi thành công là đã
upload lên Microsoft. Việc vận chuyển và tài khoản thuộc Edge.

## Dữ liệu và thứ tự ghi

- DB riêng `read-frog-settings-sync` **v1**, store `state: &id`. Mặc định off;
  device UUID, enabled/generation/counter, base hash/vector, status, last sync,
  undo và pending-apply journal. Không thêm schema vào config124/vocabulary/PDF.
- Transport **v1** `read-frog-edge-settings`, **config schema124**, codec gzip.
  Đây là định dạng đã phát hành; khi config đổi schema phải thêm reader/writer
  mới, không âm thầm project/drop trường chưa hiểu rồi ghi lại.
- Mỗi thiết bị có `rf-config:head:<device UUID>`; chunks riêng theo
  `rf-config:data:<device>:<snapshot hash>:<index>`. Header và payload có SHA-256.
  Gzip chuẩn, JSON UTF-8; server hoặc HTML về sau có thể đọc bằng gzip thông dụng.
- Nén tối đa 1 MiB raw → 32.000 ký tự base64; chunk 6.000 ký tự, dưới 8 KiB/item
  kể cả key/JSON. Inflate bị giới hạn trước parse. Dự trù tổng kho 90.000 byte,
  thấp hơn quota khoảng 100 KiB; không xóa key của thiết bị khác để lấy chỗ.
  Tối đa16 device/vector; cấu hình quá lớn báo lỗi, không cắt prompt/CSS.
- Ghi chunks trước, **head cuối** là commit marker. Head về trước chunks thì
  chờ, không xem là cloud trống. Checksum/format mới/snapshot hỏng chặn apply.
  Chỉ dọn chunks cũ/orphan của chính device sau khi giữ được head đang dùng.
- Vector clock quyết định quan hệ trước/sau; timestamp chỉ để hiển thị. Cùng
  thay đổi không lấy máy có đồng hồ nhanh hơn làm thắng. Resolve tạo clock
  bao trùm các head đã được người dùng xem. Counter được reserve trước I/O.
- Bật mới gửi. Local change debounce5s; push cách tối thiểu15s, alarm1 phút
  tiếp tục khi service worker ngủ. Tắt hủy generation/run/alarm, giữ cloud data.
- Nhận bản khác: revalidate local hash → backup → persist undo journal → ghi
  config/cờ trong cùng storage-area call → meta → xác nhận hash → kết thúc
  journal và cập nhật base. Không cập nhật SRS hoặc suy diễn review logs.
- Các RPC đọc/ghi/resolve/undo chỉ nhận từ top frame `settings-sync.html` đúng
  extension ID. `storage.sync` đặt `TRUSTED_CONTEXTS`; content script/site không
  được đọc payload qua RPC. Không log khóa hoặc chứa credential trong snapshot.

## Feedback

Gỡ hẳn `HiddenButton` Send feedback, handler mở `/help` và icon import khỏi
floating control. Settings/translate/drag/menu còn nguyên. Không chỉ ẩn bằng CSS.

## Kiểm chứng

**Đã sửa:** native Edge configuration sync nêu trên và gỡ Send feedback. Bốn
phần trước được giữ trong cùng ZIP, gồm ZIP6/HTML ôn tập và usage dashboard.

**Đã kiểm thử:** 4.163 test đạt/1 test bỏ qua, 412 file đạt/1 file bỏ qua;
`SKIP_FREE_API=true` và loại live free-api. Lint/type-check/format đạt.
Production Edge156: **24 assertion** cho sync và feedback trên hai profile
riêng: mặc định off/cùng ID, gzip dưới quota, first-pairing preview, causal
receive, concurrent conflict/explicit resolution, full-config review, backup/
undo, giữ credential riêng, chỉ GC chunks của mình, sender guard, không gọi AI
và viewport390/760/1280. Bài hồi quy bốn phần cũ **32 assertion** cũng đạt.
Source còn thử missing chunks/checksum/future header, gzip bomb, quota full,
staging failure và persistent recovery journal. Config mẫu dùng **4.412 byte**
trong storage.sync; đây không phải kích thước mọi bộ cấu hình.

Script: `scripts/debug/check-edge-settings-sync.mjs`; evidence local
`.codex/edge-settings-sync-*`. Harness dùng native storage.sync và snapshot
thật; relay dữ liệu giữa profile **mô phỏng** thay cho Microsoft account cloud.
Không gọi OpenAI trả phí hoặc dùng credential người dùng. **Chưa kiểm thử:**
đồng bộ Microsoft thật giữa hai máy và điện thoại vật lý. **Bị chặn kỹ thuật:**
không có trong implementation; chưa thể xác nhận cloud delivery từ bài mô phỏng.

Artifact đã đối chiếu CRC và **429/429 file** với build. ZIP
`ReadFrog-Edge-1.58.0A-EdgeSync.zip` **8.741.157 byte**, tăng **8.704 byte** so
với StudyFlow. SHA-256
`f8085da65aa9935c3575bfc5e1b0f18d7299ef100b53d8ee9b38e0a4a4c8c610`.
Không đổi manifest key hoặc danh tính extension khi cập nhật cùng thư mục.
HTML ôn tập không đổi: **657.779 byte**, SHA-256
`ecc40069a312ad4a274606d42dcf57db7186c7c1bea1b162e64adadf5f2dd589`.

Nguồn chính thức: [Microsoft Edge APIs](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support),
[storage.sync và quota](https://developer.chrome.com/docs/extensions/reference/api/storage),
[đăng nhập/bật sync Edge](https://support.microsoft.com/en-us/edge/sign-in-to-sync-microsoft-edge-across-devices).
