FlowRead 1.59.3A.13 — sửa hiển thị OCR ảnh chỉ có bảng hoặc code

- Package 1.59.3-a.13, numeric 1.59.3.13, display 1.59.3A. Baseline 6860ae91 / A.12.
- Khi chụp ví dụ, phát hiện ảnh chỉ có bảng hoặc code chưa được heuristic Markdown chung nhận biết. Khung giữ cấu trúc nay luôn dùng renderer an toàn; không yêu cầu heading/list để hiện đúng bảng/code.
- Giữ plain translation cũ, request/cache/prompt, OpenAI-only privacy và mọi feature/data contracts. Không thêm dependency, quyền hoặc model.
- Hai UI regression table-only/code-only; production screenshot examples có bảng/code và heading/list. Ảnh raw UI thật, OCR/dịch giả lập để minh họa, không phải benchmark chất lượng OpenAI live.
- ZIP được staging, copy asset trước/manifest cuối vào thư mục cũ; Reload entry hiện tại để dùng numeric 1.59.3.13.

[Chi tiết](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.13/IMAGE_STRUCTURE_A12.md) · [Privacy](https://github.com/dimayvegio/read-frog/blob/v1.59.3A.13/PRIVACY_POLICY.md).

SHA-256 ZIP: `12b8fb35e243c4d584668ec6a07941577a8a2552138d0a31c7552981251ca463`.
