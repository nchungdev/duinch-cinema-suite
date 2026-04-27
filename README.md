# Duinch Cinema — Media Discovery & Downloader

Hệ thống Media Discovery Engine mạnh mẽ, tự động "vét cạn" link FShare từ API và Diễn đàn, tích hợp JDownloader Dashboard với kiến trúc Clean Architecture.

## 🏗️ Architecture & Structure

Dự án được chia thành 2 thành phần chính:
- **`duinch-cinema/`**: Ứng dụng web xem phim và quản lý tải về (bao gồm Frontend React và Backend FastAPI).
- **`duinch-crawler/`**: Hệ thống cào dữ liệu tự động (Miner, Cooker) để làm giàu cơ sở dữ liệu phim.
- **`duinch-downloader/`**: Microservice chuyên biệt điều phối việc tải về qua JDownloader hoặc các engine khác.

### Directory Map
- `duinch-cinema/frontend`: Giao diện người dùng (Vite + React + Tailwind).
- `duinch-cinema/backend`: API phục vụ webapp, tích hợp logic tìm kiếm và điều phối.
- `duinch-crawler/miner`: Thu thập link raw từ các nguồn forum, web.
- `duinch-crawler/cooker`: Xử lý, phân loại và đồng bộ dữ liệu về database chính.
- `duinch-downloader`: API trung gian kết nối với JDownloader Docker.
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
