---
name: auto-validator
description: Quy trình kiểm thử và bàn giao tự động. Tự động nhận diện thay đổi để chọn chế độ test (UI/Full) và thực hiện restart thông minh sau khi hoàn thành.
---

# Auto Validator & Lifecycle Skill

Kỹ năng này điều phối giai đoạn **Validate -> Fix -> Deliver** của quy trình kỹ thuật.

## Luồng thực thi (Auto-run after each task)
1. **Analyze**: Quét các file thay đổi.
2. **Test**:
   - Chỉ sửa UI: `npm run lint` + `npm run build`.
   - Sửa Logic/API: `npm run lint` + `npm run build` + `logic_test.ts` + `test_media_api.py`.
3. **Fix**: Tự động sửa code nếu bất kỳ bước nào báo lỗi đỏ.
4. **Clean**: `git commit --amend` + `git push --force`.
5. **Restart**:
   - Sửa Backend/API: Gọi `./start_all.sh` để tái khởi động toàn bộ container/services.
   - Chỉ sửa UI: Đảm bảo Vite Dev Server vẫn chạy hoặc restart Frontend service.

## Cách sử dụng
Script hỗ trợ:
```bash
bash .gemini/skills/auto-validator/scripts/validate.sh [Optional Commit Message]
```
