# Luyện phát âm tiếng Anh Mỹ

Tính năng local **F22**, package `1.58.0-a.24`, manifest numeric `1.58.0.25`,
tên hiển thị **1.58.0A**. Baseline trước sửa: `117c7d85821d728447a8ef7e39bde2708791ee34`,
nhánh `codex/pdf-reading-panel`. Không tích hợp upstream mới trong thay đổi này.

## Sử dụng

Bôi đen tiếng Anh trên web → **Translate** hoặc **Dictionary** → **Phát âm**
trong hàng điều khiển văn bản gốc. Translate ở khung PDF/ảnh dùng cùng component,
nên cũng có nút này khi nhận diện tiếng Anh. Nút ẩn với văn bản ngôn ngữ khác
hoặc chưa đủ căn cứ; nhận diện trên máy bằng chữ/từ thông dụng và franc, dùng
ngữ cảnh thực của đoạn chọn cho từ ngắn, không gọi API chỉ để hiện nút. Từ quá
ngắn/mơ hồ chưa xác định được có thể cần chọn cả câu tiếng Anh. Không coi mọi chữ
Latin là tiếng Anh. Khung riêng của extension tránh yêu cầu quyền micro của site
đang đọc; có thể di chuyển/resize như cửa sổ Edge thông thường. Nếu không mở được
popup, mở tab dự phòng. Không tự ghim always-on-top của Windows.

1. Kiểm tra/sửa từ hoặc câu; đoạn dài có danh sách chọn câu trên máy. Tối đa
   80 token từ / 1.200 ký tự, bản thu mục tiêu tối đa 30 giây. Dấu gạch nối có
   thể tách thành hai token. Ngữ cảnh tùy chọn tối đa 2.000 ký tự giúp phân biệt
   `read`, `record` và các từ có nhiều cách đọc. Không cắt âm thanh hay câu âm thầm.
2. **Nghe mẫu giọng Mỹ** dùng provider TTS hiện có: Microsoft buộc giọng en-US,
   OpenAI thêm instruction General American chỉ cho lượt nghe đó. Không đổi cài
   đặt chung và không gọi TTS khi mở khung.
3. **Thu âm** xin quyền micro theo thao tác; **Dừng thu** để nghe lại. Mẫu/âm thanh
   đang nghe được dừng trước khi thu. Âm thanh chưa gửi tới OpenAI ở bước này.
4. **Chấm phát âm** mới gửi bản thu WAV, câu và ngữ cảnh tới OpenAI, có phí API.
   Xem điểm từng tiêu chí, nhận xét, lỗi nghe được, cách sửa và 1–3 mục tiêu lần sau.
   **Thử lại cùng đoạn** thu mới; các lần trước nằm ở lịch sử.
5. **Xuất báo cáo ChatGPT** tải Markdown đọc được, có từng lần chấm, từ/âm cần
   sửa, độ chắc chắn và bài luyện. **Xuất JSON** giữ dữ liệu chi tiết. Chọn **Đoạn
   đã luyện** để quay lại nội dung trước. Báo cáo không kèm audio hoặc API key.

## Rubric cố định en-us-v1

Đích là **General American**, ưu tiên dễ hiểu, trọng âm và nhịp tự nhiên. Chấp
nhận biến thể giọng Mỹ thường gặp như rhotic r, flap t/d, unreleased stops,
reduction và vowel mergers; không bắt chước một người nói cụ thể. Điểm là
ước lượng của AI trong mẫu ngắn, không phải CEFR, điểm thi hay chứng chỉ.

| Tiêu chí         | Từ riêng lẻ | Câu/đoạn |
| ---------------- | ----------: | -------: |
| Âm và độ rõ      |         50% |      40% |
| Trọng âm từ      |         35% |      15% |
| Nhịp và ngữ điệu |         N/A |      20% |
| Độ trôi chảy     |         N/A |      15% |
| Đọc đủ, đúng từ  |         15% |      10% |

Mỗi điểm 0–10, bước 0,5. App tự tính trung bình có trọng số rồi làm tròn tới
0,5; AI không quyết định tổng. N/A cần lý do và chia lại trọng số, không tính
thành 0. Âm và đọc đúng bắt buộc có điểm khi assessed. Trọng âm từ đơn âm tiết
có thể N/A. Anchors: 0 không hiểu được; 2 đứt gãy giao tiếp nặng; 4 nhiều trở
ngại; 6 hiểu được nhưng lỗi lặp; 8 rõ với lỗi nhỏ; 10 rõ ổn định trong mẫu đó.

Mẫu feedback chung: tổng quan → từng tiêu chí/kèm chứng cứ → điểm đang tốt →
lỗi cụ thể (từ, nghe được, đích Mỹ/IPA khi chắc, cách sửa, bài luyện) → mục tiêu
lần tiếp. Lỗi âm cần index từ hợp lệ, không tự chế timestamp. Transcript chỉ là
chép gần đúng; không dùng độ giống transcript để suy ra phát âm. Mức chắc chắn
vừa được ghi rõ; không chấp nhận lỗi phoneme mức chắc chắn thấp.

Im lặng, nhiễu, clipping nghiêm trọng, thiếu chứng cứ, không đúng bài/ngôn ngữ
→ **cần thu lại**, mọi điểm null, không bịa lỗi âm. App kiểm tra schema, bước
điểm và index; JSON sai/thiếu/truncated không được ghi điểm, không tự gọi API
để sửa JSON. Tín hiệu RMS chỉ giúp chặn im lặng, không phải thuật toán chấm âm.

## API, dữ liệu và cancellation

- Model nghe âm thanh **`gpt-audio-1.5`**, độc lập model dịch. Fixed POST
  `https://api.openai.com/v1/chat/completions`, `modalities:["text"]`, `store:false`,
  WAV input, temperature 0; không sinh audio trả về. Model hiện không hỗ trợ
  Structured Outputs: yêu cầu JSON bằng prompt rồi validate chặt trong app.
  Giữ model thực tế từ response trong từng attempt vì alias có thể thay đổi.
- Tài liệu chính thức: [audio Chat Completions](https://developers.openai.com/api/docs/guides/audio-chat-completions),
  [model](https://developers.openai.com/api/docs/models/gpt-audio-1.5).
  Không có hợp đồng điểm phát âm chuẩn hóa của OpenAI; rubric/weights là của fork.
- Credential đọc trong background sau config readiness; port chỉ nhận top-frame
  `pronunciation.html` đúng extension ID. Không nới guard Responses của engine cũ.
  Text capture opaque một lần, memory-only, TTL 10 phút, tối đa 10; URL không chứa
  câu/context. Payload provider không thêm URL/title/path của trang hay PDF.
- MediaRecorder chỉ xin audio, có generation guard cho permission đến muộn.
  Mặc định recorder F19 vẫn 60 giây; F22 chọn 30 giây. Track/timer dọn khi dừng,
  hủy hoặc đóng khung. Đổi câu/context hủy lượt đang chạy và bỏ bản thu cũ.
- Decode/resample trên trang sở hữu bởi extension sang PCM mono 16 kHz/16-bit.
  Executor kiểm tra base64, header, data size, RMS và thời lượng 0,3–31 giây
  (31 cho đuôi encoder; không tự cắt). Đầu vào compressed tối đa 8 MiB, WAV
  tối đa 992.044 byte. Phản hồi tối đa 256 KiB, timeout 90 giây, tối đa 3 job.
- Cache key gồm reference/context normalized NFC, target/rubric, prompt version,
  model yêu cầu, audio hash và credential revision. Cache hit dùng lại attempt ID,
  không tốn thêm call hay tăng số lần thử. In-flight giống nhau chia sẻ job;
  hủy một subscriber không hủy người còn lại; subscriber cuối hủy provider.
- **DB riêng** `read-frog-pronunciation` v1: `attempts` và `meta`. Lưu text/context,
  feedback/score, audio hash/duration, actual model, rubric, timestamp và stable ID;
  không lưu microphone bytes. Tối đa 1.000 attempt / 16 MiB; đầy thì vẫn hiện kết
  quả nhưng báo chưa lưu, không xóa lịch sử để nhường chỗ. Retry vì chất lượng vẫn
  có event, score null; transport errors/cancel không tạo kết quả giả.
- Clear epoch trong transaction, hủy các job khi clear; abort-aware save và recheck
  credential/epoch chặn kết quả đến muộn. UI quan sát thay đổi DB để bỏ feedback cũ.
  Lịch sử không đồng bộ Edge, không nằm trong backup cấu hình/ZIP sổ từ hay thư
  viện F19. JSON/report v1 chỉ xuất; chưa có import/merge pronunciation histories.
- Usage DB1 giữ nguyên: task `other`, token tổng thực tế từ response và audioMs;
  thiếu usage để null. Mixed audio/text token cost luôn **chưa xác định** trong
  bộ tính giá hiện tại, kể cả có giá text cùng tên model; không tính audio thành text.
- Không upload các bản shadowing F19 cũ. F22 là luồng upload mới đã được người
  dùng yêu cầu, chỉ bằng Submit rõ ràng. Không tác động vocabulary SRS, điểm đúng/
  sai hay lịch sử ôn; không suy ra lỗi đã hết chỉ vì AI không nhắc lại.

## Khi merge upstream

Giữ F01–F21 và thêm F22; không rebase đè bằng source upstream. Không sửa schema
đã phát hành của các DB/ZIP/config cũ. DB pronunciation v1 và JSON/report v1
sau phát hành cũng đóng băng; nâng cấp thêm version mới. Tách thay model/prompt/
rubric thành identity mới để tránh dùng lại điểm cũ. So sánh tiến bộ chỉ cùng
reference/context/rubric và actual model; các lượt khác vẫn được lưu nguyên.

Source chính: `src/utils/pronunciation/`, `src/entrypoints/background/pronunciation.ts`,
`src/entrypoints/pronunciation/`, nút source dùng chung Translate/Dictionary.
Giữ `scripts/debug/check-pronunciation.mjs` cùng các regression HTML/PDF/ảnh.

## Trạng thái xác minh

- Đã sửa: entry points Translate/Dictionary, thu/nghe/chấm giọng Mỹ, rubric nửa
  điểm, feedback cụ thể, thử lại/so sánh cùng nội dung, cache/usage riêng, lịch sử
  và hai loại báo cáo; giữ engine dịch và các dữ liệu đã phát hành.
- Kiểm thử API dùng **mô phỏng** để xác minh contract/cancellation/cache; microphone,
  codec, UI Edge và file download dùng thật. Không lấy điểm fixture để quảng cáo
  độ chính xác hoặc tốc độ model live.
- Chưa kiểm thử: chấm API audio live, calibration trên bộ giọng thật/người chấm,
  mọi thiết bị microphone, mọi quyền/policy Edge. Tính nhất quán rubric/validator
  không đảm bảo model sẽ cho điểm tuyệt đối giống nhau giữa các bản thu.
- Bị chặn: không có blocker triển khai; API live và hiệu chỉnh chất lượng còn
  cần thử thực tế với key và bản thu do người dùng chủ động gửi.

## Báo cáo release 07/11/2026

- **Đã sửa:** nút gọn **Phát âm**, chỉ hiện với text/ngữ cảnh nhận diện tiếng Anh
  tại máy; rubric giọng Mỹ vẫn giữ nguyên. Thu/nghe/chấm, từng lỗi và cách sửa,
  retry/so sánh, history/cache riêng và xuất Markdown/JSON. Không đổi model dịch,
  queue/streaming, credential storage, sync, SRS hoặc các schema đã phát hành.
- **Đã kiểm thử:** toàn suite **4.277 test đạt**, **1 test free API bỏ qua chủ ý**
  với `SKIP_FREE_API=true`; fmt/lint/type-check đạt. Có 24 test nhóm pronunciation/recorder, kiểm thử shared port lỗi
  an toàn; production Edge `156.0.4314.58` đạt **23** assertion phát âm: nút thật
  Translate/Dictionary, concise label, ẩn trên text Trung trong trang Anh, mic
  chỉ mở khi bấm thu, PCM conversion, track cleanup, explicit Submit, rubric/
  feedback, cache không double-count, retry và so sánh, file MD/JSON tải thật,
  desktop/390 px, cancel/late, malformed output và clear history. Evidence
  `.codex/pronunciation-1794066509019/evidence.json`; OpenAI được mô phỏng.
  Nhóm hồi quy HTML **26**, PDF song ngữ **33**, PDF/ảnh **82** assertion; logs
  cuối nằm tại `.codex/pronunciation-release-{html,pdf-bilingual,pdf-image}.log`.
- **Chưa kiểm thử:** API audio/TTS live và độ chính xác/độ lặp lại trên bộ giọng
  người thật có chuẩn đối chiếu; mọi microphone và Edge enterprise policy.
- **Bị chặn:** không có.

ZIP duy nhất giao người dùng: `ReadFrog-Edge-1.58.0A-Pronunciation.zip`, **446
file / 8.985.869 byte**, tăng **20.982 byte** so với ZIP HTML song ngữ trước.
CRC và từng entry khớp production build, không fixture key/profile, manifest
`1.58.0.25` / `1.58.0A`, không thay extension key/ID. HTML ôn từ giữ SHA-256
`a640c20d7aa510642dbda1dd59411e41c0660670ae2a97594d3654ab56aedb64`.
SHA-256 ZIP: `18efa815436c160221a26b33af9559956cd22dba18d7807c6729262cf83479cb`.

Cập nhật như trước: giải nén ZIP đè vào **đúng thư mục extension đã Load unpacked**,
bấm **Reload** trong `edge://extensions`, rồi F5 trang web/PDF. Không gỡ extension
để giữ ID, key và các dữ liệu trên máy. Tên hiển thị vẫn A, numeric version tăng.
