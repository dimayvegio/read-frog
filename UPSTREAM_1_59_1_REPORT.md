# Read Frog 1.59.1A — nâng upstream, tối ưu PDF và vẽ hình

Đối chiếu ngày 11/11/2026. Local bắt đầu tại `c2e595fc902b2372c7ecdbed3a176aa3d88205d5`
trên `codex/upstream-1.58.1-openai`, working tree sạch. Upstream trước là
`v1.58.1` / `8f015c4a830951dd98fd836989e7348849e60cea`. Tích hợp tag
[`v1.59.1`](https://github.com/mengxi-ream/read-frog/releases/tag/v1.59.1)
/ `56d05e336486aa4fc92bbb76879fd00cd8235d40` trên nhánh
`codex/upstream-1.59.1-openai`. Package `1.59.1-a.1`, manifest numeric
`1.59.1.1`, tên hiển thị **1.59.1A**. Đây là merge có lịch sử upstream,
không thay bản local bằng cây source nguyên gốc.

## Quyết định từng thay đổi upstream

| Commit     | Quyết định           | Kết quả trong fork                                                                                                                                                                   |
| ---------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `38e00917` | Nhận và mở rộng      | UUID polyfill hoạt động ở HTTP/Chrome 130–131; các UUID runtime của tính năng local cũng dùng helper, không đổi định dạng ID hay bí mật.                                             |
| `65046d9e` | Bỏ phần dịch vụ      | Không đưa lại Hosted AI pool, free translation, tài khoản/cloud backend hoặc analytics đã gỡ.                                                                                        |
| `9abe9a7a` | Nhận                 | Hiển thị bản dịch Markdown đúng thay vì plaintext, giữ engine/DOM và pane HTML local.                                                                                                |
| `b84bbc6c` | Nhận                 | Site rules cho feed For You của Threads khi đăng nhập.                                                                                                                               |
| `ee31f322` | Nhận                 | Site rules cho X khi chưa đăng nhập và mô tả repository trong GitHub organization.                                                                                                   |
| `df6aa54b` | Điều chỉnh           | Bắt lỗi menu khi tab không có content script; giữ fallback cửa sổ dịch selection PDF của fork.                                                                                       |
| `70f1c5ac` | Nhận                 | Site rules LowEndTalk.                                                                                                                                                               |
| `3a8a5376` | Nhận có chọn lọc     | Nhận phần dọn test upstream, giữ các regression của tính năng fork và các test dữ liệu đã phát hành.                                                                                 |
| `409b8edb` | Nhận và điều chỉnh   | Site rules JSON có chữ ký Ed25519, cache/fallback và alarm. So version theo ba số upstream, không coi build local số thứ tư là release site rules mới hơn. Không tải JS/WASM remote. |
| `b52aae23` | Điều chỉnh           | BCP47 và Portuguese châu Âu. Chuyển thành migration fork **124→125**, không đè migration fork121→122 đã phát hành. Đọc alias ISO cũ, chuẩn hóa message từ content script cũ.         |
| `9f7b6ad8` | Nhận phiên bản nguồn | Gồm thay đổi 1.59.0 trong tag đích; giữ hậu tố A.                                                                                                                                    |
| `b5bf6719` | Điều chỉnh           | Giọng Microsoft của bản dịch theo ngôn ngữ đích ở selection web/PDF, layout và Translation Hub; giữ OpenAI TTS/MP3/private credentials của fork.                                     |
| `56d05e33` | Nhận phiên bản nguồn | Tag đích 1.59.1; package/manifest numeric hợp lệ.                                                                                                                                    |

Remote site rules chỉ là dữ liệu định tuyến/selector/CSS có validator và chữ ký,
không phải dịch vụ dịch. Nguồn mặc định `https://rules.readfrog.app/v1/site-rules.json`;
không gửi nội dung trang, key hoặc transcript vào request đó. Nếu chữ ký, schema,
version hoặc download không hợp lệ, dùng bộ rules đóng gói/cache hợp lệ.
Workflow ký/phát hành rules cần signing secrets riêng nếu chủ fork muốn tự vận hành;
đợt này không tạo key ký hay publish rules của fork.

## Tính năng local giữ và mở rộng

F01–F24 tiếp tục ở runtime OpenAI-only: key riêng, engine dịch/DOM/glossary/queue/
streaming, TTS Microsoft/OpenAI và tải MP3, selection web/PDF, typography Việt,
buffer phụ đề hai phút, YouTube Learning, ani.pm/X/Netflix, ảnh/OCR, PDF.js tự lưu,
song ngữ PDF/HTML, sổ từ và HTML học mobile/logs, Reading Lab, phát âm, Audio
file/live/pinned source pane và cấu hình sync opt-in. Không đưa hosted service trở lại.

PDF thêm **Hình tròn / Hình vuông / Hình chữ nhật**, bốn màu hiện có. Kéo bằng
pointer chính; chỉ lưu sau khi thả, cancel bỏ hình dở. Hình tròn/vuông tính theo
pixel trang nên đúng tỷ lệ trên trang dọc/ngang/rotation/zoom. Lưu thành đường
ink khép kín: dùng chung DB1, erase, undo/redo và PDF export, không thêm schema.

Ba tối ưu: đo đúng trang mở/resume và tối đa ba canvas lân cận trước, sửa geometry
các placeholder khi cần; một OCR worker cho một dải trang explicit rồi terminate;
LRU text/folded text theo document tối đa 2.048 trang / 8.388.608 UTF-16 units
cho cả hai chuỗi (~16 MiB payload, chưa gồm metadata). Cache ở RAM, không OCR/
trích toàn tài liệu chỉ vì mở file. Tìm kiếm cold vẫn phải đọc trang và dựng index.

## Ledger dữ liệu

| Kho/format                                                                                                | Đợt này                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Config                                                                                                    | **125**, thêm frozen migration `v124-to-v125.ts`. Migrations1–124 và fixtures lịch sử giữ nguyên. Public import/export nhận config cũ, không nhập key.                                                                                                  |
| Credential DB1                                                                                            | Không đổi DB/store/ID. Journal bootstrap đọc thêm target125, giữ credential/tombstone/revision.                                                                                                                                                         |
| AppDB                                                                                                     | Thêm bước **v7** chuyển glossary target language sang BCP47; duplicate pair giữ hàng mới theo logic upstream. Không sửa v1–v6.                                                                                                                          |
| Edge settings sync                                                                                        | Writer **transport2/config125**, reader **transport1/config124 và2/config125**. v1 đóng băng. Kiểm checksum raw trước migrate, vector clocks giữ nguyên; recovery/undo DB1 đọc bản cũ. Client cũ cần nâng cấp để đọc v2. Không projection bỏ field mới. |
| PDF position/history DB1/DB2, PDF study DB1                                                               | Không đổi. Vẽ hình dùng `kind: ink` đã có.                                                                                                                                                                                                              |
| Vocabulary DB1–5 / ZIP1–6 / reports1–3, reading DB1/ZIP1, pronunciation DB1/report1, image DB1, usage DB1 | Không đổi migration/format. HTML review độc lập giữ nguyên bytes.                                                                                                                                                                                       |
| Learning/live geometry                                                                                    | Local-only key/schema cũ, không sync. Audio vẫn RAM-only, không schema mới.                                                                                                                                                                             |

Nếu legacy sync base hash không còn snapshot v1 tương ứng để chuẩn hóa sang
config125, xử lý conflict bảo thủ thay vì giả định local không có chỉnh sửa.
API key, glossary rows, sổ từ/audio/logs, PDF/image/usage không đi qua config sync.

## Kiểm thử và giới hạn

Chi tiết số liệu trước/sau, fixture hash và định nghĩa RAM:
[PDF_PERFORMANCE_1_59_1.md](PDF_PERFORMANCE_1_59_1.md).
Hướng dẫn công cụ và dữ liệu: [PDF_READER_TOOLS.md](PDF_READER_TOOLS.md).
Chuẩn bị Store và các việc chưa xác nhận: [STORE_PREPARATION.md](STORE_PREPARATION.md).

Không coi mocked OpenAI, browser fixture hoặc storage.sync cục bộ là bằng chứng
dịch vụ OpenAI live, các website đã đăng nhập hoặc Microsoft cloud delivery.

### Đã kiểm thử

- Unit suite: **4.523 passed,1 skipped**, `SKIP_FREE_API=true`; lint/type-aware và formatter.
- Production extension trên Chrome157, profile tách biệt: PDF tools/OCR/shapes29
  checks; PDF song ngữ33; PDF selection/history/image80; HTML song ngữ26;
  config sync24 (relay mô phỏng, không xác nhận Microsoft cloud).
- Audio upgrade35 checks: reload cùng thư mục từ ZIP1.58.1-a.7 giữ ID, key/revision
  và public settings sau đúng migration125; capture/WebRTC thật với âm tổng hợp,
  provider response mock. Thêm62 checks source pane/pin/SPA/recovery/fullscreen,
  bao gồm chặn shared content-runtime, dùng lại cùng phiên, không negotiation lại.
- OCR thật bốn ngôn ngữ, search wildcard/các kết quả riêng, màu/tỷ lệ hình,
  save/rename/reopen, undo/redo/erase/export, native text, mobile390px, ba canvas,
  cancel khi đổi trang và không gọi API từ các view controls.
- Ba lượt benchmark hợp lệ cho mỗi build, cùng fixture hashes. Cache payload
  bounded bằng page/character budgets; không giữ mạnh cây OCR cũ qua identity.
- So bytes migrations1–124, fixtures cấu hình lịch sử và AppDB upgrades cũ: giữ nguyên.
  SHA256 HTML vocabulary review giữ nguyên:
  `a640c20d7aa510642dbda1dd59411e41c0660670ae2a97594d3654ab56aedb64`.

### Chưa kiểm thử / bị chặn

Chưa gọi OpenAI tính phí/live, chưa kiểm thử tài khoản thật ở Threads/X/Netflix/
ani.pm hay Edge cloud delivery; đã dùng fixtures và tests upstream/local cho các
đường liên quan. Không claim mọi PDF/scan/OCR đều đúng hoặc mọi file nhanh hơn.
Chưa nộp/review Store; các bước chuẩn bị riêng ghi trong STORE_PREPARATION.md.
Không có blocker cho build ZIP cài thử. Không thay nội dung/DB trình duyệt thật
đang dùng của người dùng trong quá trình xác minh.
