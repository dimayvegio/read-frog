# PDF 1.59.1A — đo trước và sau

Ngày 11/11/2026, Windows máy phát triển, Chrome157.0.8103.40, Node26.13.0.
Hai bản đều trên cùng merge upstream1.59.1, cùng dependency/model/manifest; baseline là snapshot merge trước tối ưu,
final còn gồm ba icon hình vẽ và hoàn tất các adapter upstream không gọi trong
bài đo. Đây là so sánh toàn bộ hai build, không phải microbenchmark riêng từng hàm;
mốc trước chưa có ba tối ưu. Mỗi bản chạy ba lần tuần tự bằng
`scripts/debug/benchmark-pdf-reader.mjs`, profile mới, viewport1440×960,
DNS ngoài localhost bị chặn. Không chạy build/test khác trong lúc đo.

Fixture native1.200 trang /24 dòng mỗi trang, có trang dọc/ngang và kích thước
khác; scan8 trang cùng ảnh tiếng Anh. Files được tái sử dụng và kiểm SHA256.
OpenAI bị mock và số request bằng0; Tesseract/PDF.js/worker/models là thật.
Đây là benchmark reader/OCR cục bộ, không đo tốc độ model OpenAI.

## Trung vị ba lần

| Tác vụ                                            |       Trước |       Sau | Nhận xét                                                                   |
| ------------------------------------------------- | ----------: | --------: | -------------------------------------------------------------------------- |
| Mở PDF1.200 trang đến nội dung đầu tiên đã render |     450,7ms |   366,6ms | Giảm18,7%                                                                  |
| Tìm đầu `quasar*xyztail` trên1.200 trang          |   1.104,9ms | 1.358,0ms | Tăng22,9%; bản sau đo/đọc các trang chưa mở và tạo index trong lần này     |
| Tìm lại `not-found-huckleberry`                   |   1.010,8ms |    34,1ms | Giảm96,6%                                                                  |
| Tìm lại `final destination`                       |     977,6ms |    39,5ms | Giảm96,0%                                                                  |
| Tìm lại `never-present-987654`                    |   1.045,3ms |    46,2ms | Giảm95,6%                                                                  |
| Mở scan8 trang                                    |     132,0ms |   208,5ms | Chậm thêm76,5ms trong chuỗi đo này; không khẳng định mọi file mở nhanh hơn |
| OCR explicit đủ8 trang                            |   8.121,4ms | 6.383,8ms | Giảm21,4%; đầu ra OCR của fixture không đổi                                |
| Đỉnh tổng working set tiến trình Chrome của phiên | 1.068,95MiB | 991,56MiB | Giảm7,2%                                                                   |
| Working set sau OCR đã dừng                       |   919,07MiB | 816,20MiB | Giảm11,2%                                                                  |
| Private committed bytes sau OCR                   |   693,35MiB | 633,84MiB | Giảm8,6%                                                                   |
| JS heap sau search, sau GC                        |    12,41MiB |  16,90MiB | Tăng4,49MiB để giữ cache text                                              |
| JS heap sau reload reader, sau GC                 |     9,49MiB |   9,48MiB | Cache thuộc phiên document, không tồn tại sau reload                       |

Không kết luận RAM giảm ở mọi thời điểm: ví dụ working set khi vừa mở native
trong bài đo là657,89→676,52MiB; khi vừa tìm xong758,89→753,59MiB.
Cache đổi một phần RAM lấy tốc độ tìm lặp; chạm budget thì LRU đẩy trang cũ ra,
file lớn hơn budget có thể cần đọc lại. Không tăng số canvas đọc quá ba.

## Cách đo RAM và giới hạn

`Runtime.getHeapUsage` sau GC đo JS của renderer, không đại diện WASM/canvas.
Sampler PowerShell200ms lấy các PID từ browser CDP SystemInfo mỗi300ms;
chỉ cộng browser/processes của profile benchmark, không đọc profile người dùng.
Working set là tổng resident theo process, có thể đếm trùng shared pages;
PrivateBytes là bộ nhớ commit riêng, không đồng nghĩa RAM resident. Số trên
bao gồm browser/GPU/worker/extension, không phải riêng PDF hay incremental RAM.
Không GC/heap snapshot trong đoạn đo thời gian; GC chỉ ở mốc giữa các tác vụ.
Ba lần trên một máy, không phải chứng nhận tốc độ cho mọi PDF/máy/Edge.

Trước: `.codex/pdf-performance-before-fixed-1794395263864/results.json`.
Sau: `.codex/pdf-performance-final-1794396205159/results.json`.
Raw process samples, effective config và fixture hashes nằm cùng kết quả.
Lần sampler đầu chưa ép JSON PID về int trong PowerShell5 không có RAM samples;
đã loại bỏ hoàn toàn khỏi bảng và chạy lại đủ ba lượt trước hợp lệ.

Chạy lại (sequential, không chạy hai bản cùng lúc):

```powershell
pnpm exec node scripts/debug/benchmark-pdf-reader.mjs --extension=<before-folder> --label=before --runs=3
pnpm exec node scripts/debug/benchmark-pdf-reader.mjs --extension=.output/edge-mv3 --label=after --runs=3
```

Fixture SHA256 native: `73a5443483b6790549057c528fed136173abdd4878bd17d7846d732ca8f8a546`.
Scan: `3a09b3cf3ac897fa468aa489ccd91435fd40e84b76d07058a4c6e541ddcc43cd`.
Bản final dùng WeakMap numeric OCR identities để index không giữ mạnh cây word/
geometry cũ sau clear/edit. Một lượt đo candidate sớm hơn cũng được giữ trong
`.codex/pdf-performance-after-1794395424906`; bảng chỉ dùng ba lượt final, không
chọn số tốt nhất từ các candidate. Raw fixture hashes hai phía khớp nhau.
