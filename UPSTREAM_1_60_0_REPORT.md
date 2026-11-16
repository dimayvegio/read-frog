# Tích hợp upstream v1.60.0 → FlowRead1.60.0A

Ngày: 17/11/2026. Local bắt đầu `ea4d6d5b` (A.19); upstream cũ `v1.59.1` / `56d05e336486aa4fc92bbb76879fd00cd8235d40`; tag mới `v1.60.0` / `0528cfa6b15e49e858786205b7104b7592c20da5`. Nhánh `codex/upstream-1.60.0-openai` bắt đầu từ local mới nhất và merge thật, giữ cả hai parent; không reset/rebase fork lên upstream.

Người dùng xác nhận **ưu tiên fork**: có lợi và tương thích thì nhận/adapt, không thì skip. Quy tắc này đã thêm vào AGENTS.md. Package `1.60.0-a.1`, numeric `1.60.0.1`, display `1.60.0A`.

## Ma trận quyết định

| Commit upstream                    | Thay đổi                                              | Quyết định                                                                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c968bfdf`                         | Logs local, export diagnostics và diagnosis từng đoạn | Adapt: local only, trusted Options/Popup export; sender/context guards, sanitize lại tại boundary; giới hạn input/pending log, không ghi provider bodies/headers/keys; giữ logger legacy dev-only cho tính năng riêng. |
| `9fab1cff`                         | Preview cài đặt thay ảnh tĩnh                         | Nhận/adapt dùng icon local; minh họa không gọi API; giữ UI fork và identity riêng.                                                                                                                                     |
| `2a51f552`                         | Sửa CSS selector lang hai ký tự sau BCP47             | Port thành fork125→126; giữ cap8192, specificity, flags, idempotence; không viết lại125 cũ hoặc lặp rewrite trong portable projection cùng version.                                                                    |
| `1b0c67d8`                         | Timeout request queues                                | Port thành fork126→127; mặc định20s, nhập5–180s, commit blur/Enter, extra batch tối đa100s. Đổi timeout áp dụng attempt sau/queue đang chờ, không làm mất cancel/cache hoặc đổi chính sách retry đã có của fork.       |
| `79502c92`                         | Chữ ink/canvas trên raea.io                           | Nhận bundled rule và tests; không phục hồi remote updater.                                                                                                                                                             |
| `b9183a9b`, `2f9f7ade`             | Nâng dependency/i18next27/jsdom31/hotkeys             | Không nâng đồng loạt vì chức năng nhận vào dùng dependency hiện có. Nhận pin `returnEmptyString` và rawT compatibility; giữ bộ test phù hợp jsdom đang cài và các contracts SDK/audio.                                 |
| `a8334303`, `4d986d28`, `6e4acc88` | IF API, bridge đăng ký provider, sponsor pricing/ads  | Skip: fork chỉ xử lý nội dung trực tiếp qua OpenAI, không thêm provider/bridge/quảng bá/asset hoặc migration seeding.                                                                                                  |
| `a23a1dc5`                         | Survey ở sidebar                                      | Skip: user đã gỡ feedback; không phục hồi survey/service gửi phản hồi.                                                                                                                                                 |
| Release-only commits               | Changelog/version upstream                            | Giữ ancestry, dùng phiên bản fork có hậu tốA và báo cáo riêng.                                                                                                                                                         |

34 file cloud/auth/hosted/Notebase/analytics/session-cache đã gỡ ở fork được giữ trạng thái gỡ khi upstream sửa logging của chúng. Các conflict OpenAI/private runtime giữ guard/key/cache/error của fork, không nhận lại hosted branching. Các file engine nhận diagnosis vẫn giữ web bilingual commits, DOM restoration, marker checks và cancellation riêng.

## Dữ liệu và riêng tư

- Migrations đã phát hành đến125 giữ byte-identical; hai migration mới thuần, không import helper ứng dụng. Snapshot fixtures126/127 và toàn chuỗi được kiểm. `CONFIG_SCHEMA_VERSION=127`; private bootstrap journal chỉ mở rộng tập version được đọc, không đổi DB/khóa/identity.
- AppDB8 chỉ thêm `logRecord` bên cạnh các store1–7 giữ nguyên. Giữ glossary/terms/cache, PDF DB2/Study DB1/workspaceDB2, vocabularyDB5/ZIP1–6/report3, imageDB1 và usageDB1. Không thêm permission/dependency.
- Log tối đa3.000 record, queue chờ bounded ngay cả khi DB treo. Mỗi batch forward≤200; chỉ nhận sender của extension và đúng context/page. Reports có config public, metadata môi trường, tên miền, counts và log đã scrub; có thể vẫn chứa nội dung cá nhân, cần xem trước khi chia sẻ. Xuất file local bằng thao tác explicit; không tự upload.
- Diagnosis chỉ đọc verdict/local DOM, không tự dịch/AI. Trích đoạn mẫu RAM bị giới hạn, node tracking weak/bounded; source DOM không bị thay text bởi outline.
- A.19 vẫn hiệu lực: không Edge account sync, không đọc/xóa kho sync cũ; landing HTML cũ không script, alarm riêng bị retire. Giữ export/import/backup file và key riêng.
- PDF binary luôn xử lý trên máy. Giữ OCR local, OpenAI crop/full-page image edits explicit theo A.15–A.17, TTS/audio/dubbing guards, nguồn CC native và buffer120s.

## Validation và gói phát hành

Bằng chứng ở `.codex/review-160/`, chi tiết `store/VALIDATION.md`: 5.002 unit tests passed/1 skip, 22 browser suites/663 checks, lint/typecheck/format và network/store audit đạt. API mock/$0, Chrome profile QA riêng; không tuyên bố live model quality, tài khoản/DRM hoặc soak120 phút. Main Edge không bị điều khiển. ZIP duy nhất sẽ được stage/copy đè đúng thư mục cài đặt cũ, manifest sau cùng; người dùng Reload cùng entry/ID.
