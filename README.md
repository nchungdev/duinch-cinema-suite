# Duinch Cinema Suite — The Ultimate Discovery, Fulfillment & Playback System

Hệ thống Media Discovery Engine mạnh mẽ, tích hợp JDownloader Dashboard và trình phát phim cao cấp với kiến trúc Clean Architecture. Một bộ giải pháp toàn diện bao gồm Crawler, Downloader và Cinema Dashboard.

## 🏗️ Architecture & Structure

Dự án được chia thành các thành phần chính theo mô hình Monorepo:
- **`duinch-cinema/web`**: Ứng dụng web xem phim và quản lý tải về (Vite + React + Tailwind).
- **`duinch-cinema/shared`**: Logic nghiệp vụ, Models và API Clients dùng chung.
- **`duinch-cinema/backend`**: API phục vụ toàn bộ hệ thống, tích hợp logic tìm kiếm, điều phối và JDownloader Control (FastAPI).
- **`duinch-crawler/`**: Hệ thống cào dữ liệu tự động (Miner, Cooker) để làm giàu cơ sở dữ liệu phim.
- **`duinch-downloader/`**: Microservice chuyên biệt để tương tác với JDownloader API.
- `data/`: Nơi lưu trữ tập trung cache, database (SQLite/Postgres) và cấu hình người dùng.

---

## 📈 Project Progress (AI Context)

### ✅ Đã đạt được
- **Discovery Engine:** Hỗ trợ SSE, TimFShare API, Forum Hunter (HDVietnam, Voz).
- **Clean Architecture:** Refactor toàn bộ Backend sang mô hình Domain-Driven Design (DDD).
- **Database Centralization:** Chuyển dịch dữ liệu về thư mục `data/` gốc.
- **Premium UI:** Giao diện DiscoveryGrid hiện đại, mượt mà.

### 🚀 Mục tiêu tiếp theo
- [ ] Xây dựng Private FShare Crawler chuyên sâu cho các box ẩn.
- [ ] Tích hợp tính năng "Download All" (Gom link lẻ thành Folder ảo trong JD).
- [ ] Hoàn thiện luồng Torrent Stream Engine.

---

## 🤖 AI Guidelines (For Coding Assistants)

### Nguyên tắc chung
- **Impact Analysis:** Luôn chạy phân tích tác động trước khi sửa đổi các hàm/class quan trọng.
- **Clean Code:** Tuân thủ Clean Architecture. Business logic nằm trong `domain` và `use_cases`.
- **Environment:** Sử dụng `./run` để chạy môi trường phát triển local.
- **Documentation:** Luôn cập nhật file `README.md` này sau mỗi thay đổi lớn về kiến trúc hoặc tiến độ.

### Phím tắt & Lệnh
- **Lệnh hợp nhất (Khuyên dùng):** `./run` (Chọn option để chạy)
- Dọn dẹp Cache: `./scripts/clear_cache.sh`

---

## 🛠️ Setup & Deployment

### Docker (Khuyên dùng)
```bash
docker-compose up -d
```

### Chạy trực tiếp (Local Dev)
1. Cài đặt Python venv: `python3 -m venv venv && source venv/bin/activate`
2. Chạy lệnh: `./run` và chọn option 1.
