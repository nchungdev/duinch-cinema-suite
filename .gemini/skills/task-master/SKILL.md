---
name: task-master
description: Quy trình phát triển phần mềm chuyên nghiệp 5 giai đoạn: Đọc hiểu, Phân tích thiết kế, Triển khai, Kiểm thử và Release. Sử dụng khi bắt đầu một nhiệm vụ mới để đảm bảo tính kỷ luật, sự phê duyệt của người dùng trước khi code và chất lượng đầu ra.
---

# Task Master

Kỹ năng này áp dụng quy trình làm việc nghiêm ngặt để đảm bảo mọi thay đổi đều được kiểm soát và đạt chất lượng cao nhất.

## Quy trình thực thi

### 1. Đọc hiểu (Understanding)
- Tóm tắt yêu cầu người dùng ngay lập tức.
- Xác định mục tiêu cuối cùng và các rủi ro tiềm ẩn.
- Khẳng định các ràng buộc về UI và Data Contract.

### 2. Phân tích & Thiết kế (Analysis & Design)
- Sử dụng `enter_plan_mode` cho các thay đổi phức tạp.
- Trình bày giải pháp kiến trúc (ví dụ: Clean Architecture layers).
- Mô tả chi tiết các thay đổi dự kiến đối với file và dữ liệu.
- **Dừng lại và yêu cầu Approve từ người dùng.**

### 3. Triển khai (Implementation)
- Thực hiện sửa đổi mã nguồn sau khi đã được duyệt thiết kế.
- Áp dụng các thay đổi một cách tuần tự và có kiểm soát.
- Đảm bảo code sạch, có comment và đúng type-safety.

### 4. Kiểm thử (Testing)
- Luôn chạy benchmark hoặc tạo script test mới để xác thực.
- Đối soát kết quả với Metadata chuẩn (ví dụ TMDB).
- Đảm bảo tỉ lệ thành công và độ "sạch" của dữ liệu đạt yêu cầu.

### 5. Release
- Thực hiện `git commit` với thông báo chuyên nghiệp.
- Xóa bỏ các file rác, file debug tạm thời.
- Tổng kết kết quả đạt được bằng dữ liệu cụ thể.

## Nguyên tắc cốt lõi
- **Tuyệt đối không tự ý thay đổi UI** mà không trình bày thiết kế và được duyệt.
- **Tuyệt đối không tự ý thay đổi Data Contract** (Cấu trúc dữ liệu API trả về).
- Luôn ưu tiên dữ liệu thực từ các nguồn tin cậy.
