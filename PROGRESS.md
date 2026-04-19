# Project Progress & Context Snapshot (Hand-off)
**Last Updated:** Sunday, April 19, 2026

## 1. Objective & Overall Goal
Xây dựng Media Discovery Engine mạnh mẽ, "vét cạn" link FShare từ API và Diễn đàn, tích hợp JDownloader Dashboard với kiến trúc Clean Architecture chuyên nghiệp.

## 2. Current Architecture (Clean Architecture - Pragmatic)
Hệ thống đã được refactor hoàn toàn:
- **`backend/app/domain/models/`**: Định nghĩa Data Contract (Media, TMDB). Đây là "nguồn sự thật" duy nhất.
- **`backend/app/infrastructure/`**: Chứa các Scrapers (KKPhim, OPhim, TimFShare, Forum Miner), Clients (TMDB, Torrent) và Cache (Redis).
- **`backend/app/use_cases/`**: Lõi nghiệp vụ điều phối (Discovery, Downloader, Stream).
- **`backend/app/api/endpoints/`**: Các Controller tinh gọn.

## 3. Achieved Milestones (Bàn giao thành công)
### ✅ Discovery Engine "Pro Max"
- **SSE (Server-Sent Events):** Discovery theo thời gian thực trên UI.
- **TimFShare API v1:** Tối ưu cho Movie, lọc sạch rác, chỉ lấy Video và Folder chất lượng.
- **Forum Folder Hunter:** Chọc thủng bảo vệ của **HDVietnam (.ai domain)**, TimFShare Forum và Voz bằng kỹ thuật **Dynamic Token Bypass**.
- **Ultimate Identity Guard:** Tách biệt tuyệt đối các phần phim (Ví dụ: Naruto 1999 vs Shippuden) bằng Regex và Episode Hard-cap.
- **Smart Filtering:** Lọc đúng Media Type (Movie vs TV), thắt chặt Niên giám (Year) và loại bỏ Game ISO.

### ✅ Backend Stability
- **Redis Caching:** Lưu trữ kết quả Discovery 6h, hỗ trợ Force Refresh.
- **Data Integrity:** Loại bỏ trường null (`magnet`, `seeders`) cho link FShare để làm sạch JSON.
- **Error Handling:** Xử lý ID `undefined` từ Frontend một cách an toàn.

### ✅ Frontend Premium UI
- **DiscoveryGrid:** Giao diện thẻ phim cao cấp, đổ bóng đa lớp, hiệu ứng hover mượt mà.
- **Search Logic:** Đồng bộ hóa hoàn toàn với Backend, hỗ trợ đầy đủ Tab (All, Movie, TV).
- **Routing:** Đã sửa lỗi gãy URL `undefined`.

## 4. Technical Secrets (Lưu ý cho thiết bị khác)
- **HDVietnam:** Luôn sử dụng domain `www.hdvietnam.ai`. Cần bóc tách `_xfToken` và duy trì Session để Search.
- **TimFShare:** Sử dụng POST với tham số `?query=` trên URL thay vì trong Body.
- **Strict Matching:** Khi so khớp tiêu đề, luôn dùng `\b` (word boundary) hoặc Regex chuyên biệt cho dấu gạch dưới `_`.
- **Media Contract:** Frontend mong đợi cả 3 trường `id`, `tmdb_id`, và `slug` mang cùng giá trị ID của TMDB.

## 5. Next Focus (TODOs)
- [ ] Xây dựng Private FShare Crawler chuyên sâu hơn cho các box ẩn.
- [ ] Tích hợp tính năng "Download All" (Gom link lẻ thành Folder ảo trong JD).
- [ ] Hoàn thiện luồng Torrent Stream Engine (nếu cần).
- [ ] Mở rộng sang các nguồn link quốc tế (Real-Debrid integration).

## 6. How to Start Next Session
1. Chạy `redis-server`.
2. Chạy `./start_all.sh` để kích hoạt Watch Mode cho cả FE và BE.
3. Truy cập `http://localhost:8086/docs` để kiểm tra API mới nhất.
