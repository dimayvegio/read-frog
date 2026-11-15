# FlowRead

Đọc, nghe và học ngôn ngữ với khóa OpenAI API của bạn.

FlowRead hỗ trợ dịch trang web/đoạn bôi đen, từ điển, PDF cục bộ song ngữ, phụ đề video và sổ từ. Nghe TTS, tải MP3 khi cần, luyện gõ/nghe/điền từ và xuất báo cáo từng từ.

- PDF trên máy: tìm kiếm, wildcard, zoom, mục lục, bookmark, ghi chú/vẽ, tự nhớ vị trí đọc; dịch từng đoạn hoặc khoảng trang bạn chọn. OCR cục bộ đóng gói sẵn; OpenAI OCR vùng ảnh là tùy chọn. Không upload PDF gốc.
- Video: phụ đề gốc được hỗ trợ trên YouTube, Netflix, X và ani.pm. Lồng tiếng OpenAI từ phụ đề gốc/đã dịch, chỉnh âm lượng và lệch giọng trong khi phát. AI tùy chọn nghe mẫu audio đang phát và ngữ cảnh CC để chọn giọng có sẵn cho người nói. Không nhân bản giọng, không tự chép lời khi thiếu CC.
- Audio: file → chữ, phụ đề thời gian khi API được chọn trả timestamps; thu trước/chép lời trực tiếp từ tab và dịch ngữ cảnh tùy chọn.
- Học: sổ từ có tên, ôn tập tương thích điện thoại, nhập/xuất/logs từng từ. Luyện phát âm tiếng Anh chỉ gửi ghi âm sau khi bạn bấm chấm điểm.

Không cần tài khoản/thuê bao FlowRead. AI cần khóa OpenAI riêng, phát sinh phí API do OpenAI tính; ChatGPT subscription không bao gồm API credit. Nội dung gửi trực tiếp OpenAI, không qua máy chủ xử lý FlowRead; không quảng cáo/telemetry. Đọc/tìm kiếm/chú thích PDF cục bộ không cần khóa. Đồng bộ Edge tùy chọn chỉ gồm cấu hình nhỏ, không gồm khóa/sổ từ/audio.

Phụ đề/lấy audio phụ thuộc trang và player. AI tự phân tích nghe mẫu trong lúc phát, không lấy tức thì audio tương lai hoặc vượt DRM. Kết quả AI có thể sai. Giọng lồng tiếng là AI, không phải tác giả video.

FlowRead là fork độc lập của Read Frog, GPL-3.0. Hỗ trợ/quyền riêng tư: admin@4dv.top. Mã nguồn/chính sách: https://github.com/dimayvegio/read-frog .
