/**
 * Các hàm tiện ích dùng chung để định dạng dữ liệu hiển thị (UI Formatters).
 */

const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.mov', '.m4v', '.flv', '.wmv', '.mpg', '.mpeg'];
const ARCHIVE_EXTENSIONS = ['.zip', '.rar', '.7z', '.tar', '.iso'];

export function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

export function formatDate(ts: string | number | null | undefined): string | null {
  if (!ts) return null;
  try {
    const date = new Date(typeof ts === 'number' ? ts * 1000 : ts);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return null;
  }
}

/**
 * Kiểm tra xem một cái tên có phải là tệp tin đa phương tiện hoặc nén không.
 */
export function isKnownFile(name?: string): boolean {
  if (!name) return false;
  const lowerName = name.toLowerCase();
  return [...VIDEO_EXTENSIONS, ...ARCHIVE_EXTENSIONS].some(ext => lowerName.endsWith(ext));
}
