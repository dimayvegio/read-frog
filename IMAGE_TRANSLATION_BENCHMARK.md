# Đánh giá cache, dịch ảnh một lượt và phím tắt

Ngày07/11/2026, so sánh ZIP đã phát hành `1.58.0-a.12` /manifest1.58.0.13
với `1.58.0-a.13` /manifest1.58.0.14. Baseline source `f4737d6c`; tên hiển thị
của cả hai vẫn là1.58.0A. Bộ đo nằm trong
`scripts/debug/check-fast-image.mjs`, gọi bởi `check-pdf-reading.mjs`.

**API được mô phỏng200 ms/request. Đây không phải benchmark tốc độ hoặc chất
lượng của model OpenAI thật.** Số lượt request phản ánh luồng thực thi đã
kiểm tra; thời gian bên dưới chỉ áp dụng cho điều kiện thử này.

## Kết quả cuối

| Trường hợp                     | Lượt API mỗi lần | Trung vị | P95 mẫu |
| ------------------------------ | ---------------: | -------: | ------: |
| Bản a.12, OCR rồi dịch         |                2 |   446 ms |  457 ms |
| Bản a.13, Nhanh, cache chưa có |                1 |   243 ms |  250 ms |
| Bản a.13, Nhanh, cache có sẵn  |                0 |    30 ms |   39 ms |

- Lượt API giảm **50%** ở fast cold và **100%** khi trúng cache.
- Thời gian trung vị trong phép thử giảm **45,5%** và **93,3%** tương ứng.
  Không suy ra phần trăm này cho API live, hoặc kết luận chi phí giảm50%:
  lượng token/ảnh và giá model chưa được đo.
- Hai bước mới vẫn gọi2 request khi cache rỗng và0 khi trúng cả OCR/text.
  Đổi target tái dùng OCR, chỉ gọi lại bản dịch. Có glossary toàn cục hoặc
  prompt khác Default thì tự giữ đường hai bước.
- Shortcut mặc định gợi ý **Alt+Shift+S** được Edge đăng ký và trả qua
  commands.getAll. Handler capture/throttle/fallback có unit test. Nó bỏ
  bước mở popup; chưa đo thời gian thao tác người dùng hoặc bấm phím OS thật.

## Phương pháp và giới hạn

Edge156.0.4314.58, profile test riêng; hai extension có ID/origin khác nhau,
cùng browser, ảnh PNG chữ tiếng Anh do fixture tạo, cùng cấu hình model
`gpt-4o-mini` nhưng response mô phỏng. Không đọc hoặc dùng API key thật.
Mỗi trường hợp20 lượt, thứ tự xen kẽ baseline → fast cold → fast warm.
Cold xóa cache trước lượt đo; warm dùng ngay kết quả cold trước đó. Đo từ
kích hoạt button production tới khi khung kết quả mới xong; gồm encode crop,
IndexedDB thật, private runtime và render UI. Chuyển tab, chọn ảnh lần đầu và
xóa cache không nằm trong thời gian. Không đo sinh token hoặc chất lượng OCR.
P95 tính từ20 mẫu; đây là mẫu thử nhỏ trên một máy/một ảnh, không phải SLA.

Số liệu gốc từng lượt:
[image-translation-1.58.0-a.13.json](benchmarks/image-translation-1.58.0-a.13.json).

## Kiểm tra đúng và giới hạn tài nguyên

- Fast dùng JSON schema original/translation, stream dần và chỉ cache kết
  quả hoàn chỉnh. Khung chung không gọi text API thêm khi fingerprint khớp.
- Thử cache sau reload; đổi target/model/reasoning/temperature/key/prompt/
  glossary/cleanup không dùng sai kết quả. Thứ tự thuộc tính options được
  chuẩn hóa. Sửa chữ, force-read, Regenerate vẫn hoạt động.
- DB cache riêng v1 chỉ chứa hash/chữ/bản dịch và metadata; không ảnh/key/path.
  Giới hạn500 record,16 MiB, TTL30 ngày; LRU và byte ledger có test tải lớn.
  TTL là thời hạn sử dụng; entry hết hạn được dọn khi đọc/ghi cache tiếp theo.
- Xóa cache trong lúc request chạy, abort, output rỗng/sai schema/quá dài đều
  không để request cũ hồi sinh cache hoặc tự gọi dịch một phần.
- Production browser: **77 assertion PDF/ảnh/benchmark đạt**. Vocabulary68
  và scale1.000 từ/2.000 MP3/9.000 answers25 assertion đạt. HTML ôn từ giữ
  nguyên. Các unit test và kiểm tra bắt buộc được chạy lại trước push.

**Đã sửa:** cache OCR/fast/text, fast một lượt, shortcut configurable, giữ
hai bước/glossary/prompt và chống mất ảnh nếu đổi mode trong lúc ảnh đang mở.
**Chưa kiểm thử:** OpenAI live/độ chính xác dịch thực tế, mọi model vision+
structured output, phím tắt OS thật trên profile người dùng.
**Bị chặn:** không có blocker triển khai hoặc đóng ZIP.
