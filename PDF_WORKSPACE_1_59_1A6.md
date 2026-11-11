# PDF: chỉnh đoạn, chọn nhiều hình và bookmark — a.6

Package `1.59.1-a.6`, manifest `1.59.1.6`, tên hiển thị **1.59.1A**.
Bắt đầu từ local HEAD `95892954`, nhánh `codex/upstream-1.59.1-openai`.
Upstream vẫn `v1.59.1` / `56d05e33`, config125; không merge upstream ở đợt này.

## Đã sửa và cách dùng

1. **Song ngữ theo đoạn → Chỉnh đoạn**: đặt con trỏ trong ô chữ gốc rồi
   **Tách tại con trỏ**, hoặc **Gộp với đoạn sau**. **Bỏ qua đoạn này** loại
   header/footer/số trang khỏi yêu cầu dịch; **Cho dịch lại đoạn này** phục hồi.
   **Khôi phục chia tự động** xóa riêng chỉnh sửa của trang đang xem. Cách chia
   lưu theo hash nội dung PDF và fingerprint lớp chữ. Mở lại hoặc đổi tên file
   vẫn dùng được; nếu OCR/lớp chữ thay đổi thì giữ bản chỉnh cũ nhưng không áp
   lên nguồn khác. Chữ canvas/text layer gốc không bị viết lại. Vùng đánh dấu
   sau tách là ước lượng theo phần chữ, không hứa là tọa độ từng từ chính xác.
2. **Chọn chữ** hoặc **Chọn / sửa hình**: bấm nét, giữ **Shift+bấm** để thêm/bớt
   nhiều hình cùng trang, tối đa100. Kéo thân để di chuyển cả nhóm; kéo tám chốt
   để resize. Line/arrow đơn vẫn có hai chốt. Copy/paste/nhân bản dùng nút cạnh
   hình hoặc `Ctrl+C` / `Ctrl+V` / `Ctrl+D`, giữ hình gốc và sinh ID mới; tối đa
   100 hình/20.000 điểm mỗi lần copy. Clipboard riêng chỉ ở RAM của document,
   không đọc clipboard hệ thống hoặc lấy quyền mới. Chọn chữ bình thường vẫn
   copy bằng phím như trước.
3. Bảng cạnh hình có bốn màu nét, **Độ dày nét**, **Độ đậm**, **Màu nền hình**.
   Nền áp dụng cho đường khép kín, phủ20% nhân độ đậm đã chọn để vẫn đọc được
   chữ bên dưới. Kiểu mới lưu/mở lại được, copy theo hình và xuất vào PDF có
   chú thích. Hình cũ không có metadata giữ độ dày/màu/cách xuất trước đó.
4. **Bookmark** trên toolbar: tên, ghi chú tùy chọn và màu. Đánh dấu chính vị
   trí đang đọc gồm trang, offset chuẩn hóa và zoom. Bấm tên để quay lại đúng
   vị trí; sửa tên/màu/ghi chú hoặc xóa mà không đổi ID/vị trí. Khác với tự nhớ
   vị trí cuối, một PDF có nhiều bookmark riêng.

Nút **Hoàn tác / Làm lại**, `Ctrl+Z` / `Ctrl+Shift+Z` dùng cùng thứ tự cho
hình, kiểu nét, bookmark và chia đoạn. Mỗi gesture hoàn tất chỉ ghi một revision
annotation và một lệnh undo. Pointer preview/rAF không ghi DB; cancel/scroll/
blur/resize/Escape bỏ gesture. Ctrl+Z hủy gesture đang kéo trước khi hoàn tác.
Lịch sử tối đa50 lệnh và8 triệu ký tự snapshot ước tính; giữ ít nhất lệnh gần
nhất. Đây là hạn mức payload, không phải số đo RAM trình duyệt/Windows.

## Dữ liệu và hợp đồng nâng cấp

**Không sửa published Study DB1, PDF DB2, config125, sync, credential,
vocabulary, ZIP/report hoặc migration cũ.** Thêm DB độc lập
`read-frog-pdf-workspace`, version1, store `documents`, khóa hash64 ký tự:

- `{id, revision, styles, bookmarks, layouts}`; `revision` dùng CAS/transaction.
- `styles`: map annotation ID → `{width, opacity, fill}`, tối đa4.000 entry;
  width1–8, opacity0,1–1, fill `none` hoặc một trong bốn màu cũ.
- `bookmarks`: tối đa500 item `{id,name,note,color,page,offset,zoom}`; tên120,
  ghi chú2.000 ký tự, trang/offset/zoom được kiểm tra trước khi lưu.
- `layouts`: tối đa100 trang `{page,source,paragraphs}`; source SHA256 của ID/chữ
  auto, tối đa120 đoạn/trang,20.000 ký tự/đoạn, ID ổn định theo nguồn/thao tác;
  `excluded` chỉ cho biết không dịch. Tổng record tối đa2 triệu ký tự JSON,
  tối đa100 tài liệu có dữ liệu. Đọc đơn thuần không tạo record.

DB/format mới này được đóng băng từ bản a.6; lần nâng tiếp phải thêm migration
mới hoặc store/format mới, không sửa format1 tại chỗ. Sidecar không đi vào
Edge config sync, xuất sổ từ hay audio. Bookmark/bố cục không được nhúng vào
PDF xuất; nét/màu/độ đậm đã vẽ có trong bản PDF xuất. Không hứa backup/sync các
metadata mới qua chức năng backup cấu hình.

Hình vẫn là `kind: ink` trong Study DB1, không thêm field/kind vào annotation.
Group update kiểm tra tất cả object gốc và revision, giữ thứ tự lớp/ID và lưu
một lần. Không dùng undo từ cửa sổ cũ để đè cửa sổ mới. Nạp lại dữ liệu xóa
lịch sử undo trong phiên; đóng file hủy listener/frame/clipboard và tác vụ muộn.

Kiểu copy đặt vào sidecar trước khi ghi ink. Hai DB không có transaction chung;
nếu bước ink bị hủy, có thể còn kiểu cho ID chưa dùng, không hiển thị và vẫn
nằm trong giới hạn4.000. Undo ink có thể giữ kiểu để redo; redo copy áp lại
kiểu đã chụp, kể cả khi undo metadata trước đó đã loại ID copy. Không khẳng
định atomic transaction giữa hai DB hoặc viết lại dữ liệu cũ để giả lập điều đó.

F20 vẫn dùng cache/queue/provider riêng cũ. Đổi membership đoạn ngay trên cùng
trang cũng hủy stream/restore đang chạy, loại output muộn; đoạn excluded không
đi qua cache lookup hay provider. Chỉnh/gộp/tách/bỏ qua/reset/mở lại chỉ đọc
cache local, không tự dịch/OCR/upload hoặc thử trả phí lại. Dịch trang/đoạn
vẫn cần thao tác explicit. Giữ keyed native host, ba canvas, OCR worker/LRU,
annotation editor a.2–a.5, font/theme PDF và các tính năng khác của fork.

## Đã kiểm thử

- Unit PDF43 kiểm tra trong9 file; toàn repo **4.548 passed,1 skipped**.
  Free API external được cố ý loại với `SKIP_FREE_API=true`. Type-aware lint,
  type-check và formatter đạt.
- Production **225 kiểm tra** trên đúng bundle ZIP, Chrome157.0.8103.40,
  profile độc lập: workspace23, UX60, OCR/study/export29, bilingual33 và
  PDF/image/reading80. Bao gồm move/resize cả nhóm một revision, cancel, kiểu
  nét không đổi geometry, copy mới ID, undo bookmark/copy rồi redo giữ kiểu,
  vị trí/zoom bookmark, rename/delete/undo, layout sau mở lại, reset, bỏ footer
  khỏi provider, không rò metadata sang PDF khác và phone390px.
- Provider được mock; thao tác mới không gọi provider trước khi bấm dịch.
  Sau dịch explicit, reset/mở lại/bookmark không thêm request trả phí. Unit
  kiểm tra CAS/cancel, Unicode, hạn mức, membership cùng trang bỏ output cũ,
  excluded không lookup/translate và xuất PDF có fill/opacity/nét mới.
- Evidence: `.codex/pdf-workspace-1794418029547`,
  `.codex/pdf-ux-1794418045089`, `.codex/pdf-study-1794418057346`,
  `.codex/pdf-bilingual-1794418071100`; log `.codex/pdf-workspace-a6-*.log`
  gồm regression reading80 và toàn bộ unit. Không dùng key/profile Edge thật
  hoặc upload PDF cá nhân. Fixture cá nhân không đưa vào ZIP/repo.

## Chưa kiểm thử và bị chặn

Chưa thao tác trên profile Edge thật của người dùng hoặc gọi OpenAI trả phí.
Chưa kiểm hết mọi PDF mã hóa, font, bảng, thiết bị cảm ứng và bố cục nhiều cột.
Gộp/tách cần kiểm tra lại thứ tự chữ nguồn; không tự suy luận tất cả header/
footer ở mọi trang. Nhóm hình giới hạn cùng trang, chưa có lasso hoặc xoay.
Không có hạng mục bị chặn. Không có số đo tăng tốc/RAM mới trong đợt này.

## Phát hành và cập nhật

Một ZIP `ReadFrog-Edge-1.59.1A.zip`, numeric `1.59.1.6`, display `1.59.1A`.
ZIP21.846.563byte,472file, tăng6.172byte so với a.5; không thêm thư viện lớn.
SHA256 `156bdcde5dae071af08bc74234e9e92e5f3ebb3998120c8ac10832953ae497a4`.
Đã xác minh CRC/root manifest/paths/key, stage riêng rồi copy đè vào
`C:\Users\TIEN\Downloads\ReadFrog-Edge-1.58.0A`, manifest cuối. Cả472 hash khớp
qua filesystem, ID/key/quyền giữ nguyên, từ1.59.1.5 lên1.59.1.6. Không điều
khiển Edge hoặc gỡ/cài lại, không đụng browser data. Report:
`.codex/extension-update/20261111T172916Z-54d520bf/update-report.json`.
User Reload entry hiện có và mở lại trang reader để nhận công cụ mới.
