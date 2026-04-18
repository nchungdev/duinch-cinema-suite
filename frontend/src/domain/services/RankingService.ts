/**
 * Domain Service: RankingService
 * Chịu trách nhiệm sắp xếp và đánh giá chất lượng của các luồng phát / file tải về.
 */

const QUALITY_RANK: Record<string, number> = {
  '4K': 0, 
  '2160P': 0, 
  'REMUX': 1, 
  '1080P': 2, 
  '720P': 3, 
  'HD': 4, 
  'MHD': 5, 
  'SD': 6, 
  'CAM': 7
};

export class RankingService {
  /**
   * Sắp xếp danh sách link (Direct/Torrent)
   * Ưu tiên 1: Folder (Thư mục)
   * Ưu tiên 2: Chất lượng (4K > 1080p > HD)
   * Ưu tiên 3: Bảng chữ cái (A-Z)
   */
  static sortMediaLinks(links: any[]): any[] {
    return [...links].sort((a, b) => {
      const aIsFolder = a.is_folder || a.url?.includes('/folder/') || a.url?.includes('/folders/');
      const bIsFolder = b.is_folder || b.url?.includes('/folder/') || b.url?.includes('/folders/');
      
      // Folders always come first
      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;

      // Then by quality
      const aQ = (a.quality || 'HD').toUpperCase();
      const bQ = (b.quality || 'HD').toUpperCase();
      const aRank = QUALITY_RANK[aQ] ?? 10;
      const bRank = QUALITY_RANK[bQ] ?? 10;
      if (aRank !== bRank) return aRank - bRank;

      // Finally by name
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  /**
   * Xếp hạng chất lượng Torrent dựa trên Seeders (Mô phỏng tốc độ)
   */
  static estimateTorrentSpeed(seeders: number): string {
    const kbps = seeders * 120;
    if (kbps >= 1024 * 10) return `~${(kbps / 1024).toFixed(0)} MB/s`;
    if (kbps >= 1024) return `~${(kbps / 1024).toFixed(1)} MB/s`;
    return `~${kbps} KB/s`;
  }

  /**
   * Đánh giá số lượng Seeder thành số điểm Bar (1 đến 5)
   */
  static getSeederBars(seeders: number): number {
    if (seeders === 0) return 0;
    if (seeders < 10) return 1;
    if (seeders < 30) return 2;
    if (seeders < 60) return 3;
    if (seeders < 100) return 4;
    return 5;
  }
}
