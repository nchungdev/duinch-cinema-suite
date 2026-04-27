import { MediaRepository } from '../../infrastructure/repositories/MediaRepository';
import { BaseMedia } from '../../domain/models/Media';

/**
 * Use Case: GetMediaDetail
 * Điều phối việc lấy thông tin chi tiết phim và các trạng thái liên quan.
 */
export class GetMediaDetail {
  async execute(mediaType: string, slug: string): Promise<BaseMedia> {
    if (!slug) throw new Error('Slug is required');
    
    // Hiện tại chỉ đơn giản là gọi Repository
    // Nhưng đây là nơi lý tưởng để thêm logic:
    // 1. Kiểm tra Local Storage Cache
    // 2. Gộp trạng thái "Đã tải về" từ một Repository khác
    return await MediaRepository.getDetails(mediaType, slug);
  }
}
