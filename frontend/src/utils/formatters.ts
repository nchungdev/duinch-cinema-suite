/**
 * Các hàm tiện ích dùng chung để định dạng dữ liệu hiển thị (UI Formatters).
 */

export function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

export function formatDate(ts: any): string | null {
  if (!ts) return null;
  try {
    const date = new Date(typeof ts === 'number' ? ts * 1000 : ts);
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return null;
  }
}
