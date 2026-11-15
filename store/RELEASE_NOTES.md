FlowRead 1.59.3A.10 — MP3/SRT upload diagnostics

- Package 1.59.3-a.10, numeric 1.59.3.10, display 1.59.3A. Baseline 310c785e / A.9.
- Chuẩn bị 100% được ghi rõ là trên máy; chưa xác nhận OpenAI nhận file. Lỗi sau đó có mã AT-* để phân biệt network, HTTP/key/model/limit/format, phản hồi SRT hoặc timeout 15 phút.
- Không hiển thị response body/key/path/exception, không tự retry/đổi model/gửi thêm audio. Giữ timestamp API hợp lệ và fixed OpenAI endpoints, không đổi permission/schema.
- MP3 tổng hợp 18.001.772 byte truyền đủ và xuất SRT với API mock. Chưa tái hiện lỗi của file người dùng trên OpenAI thật; bản này cải thiện chẩn đoán, không tuyên bố đã sửa nguyên nhân chưa biết.
- 4.711 unit tests đạt / 1 skip; Chrome probe với MP3 18 MB và tám trường hợp lỗi giả lập đạt.
- Validation và giới hạn: store/VALIDATION.md. Reload entry cũ sau cập nhật, numeric 1.59.3.10.

[Chi tiết](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.10/AUDIO_UPLOAD_DIAGNOSTICS_A10.md) · [Privacy](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.10/PRIVACY_POLICY.md).

SHA-256 ZIP: `319a8b339165361c3f780dc323ff3e55650314b6e9ee1e34c4a46cf613430eee`.
