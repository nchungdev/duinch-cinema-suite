/**
 * Domain Entity: StreamLink
 * Chịu trách nhiệm chuẩn hóa dữ liệu từ mọi nguồn scraper (KKPhim, OPhim, Fshare, Torrent)
 * và cung cấp các phương thức truy xuất URL an toàn.
 */

export type StreamType = 'HLS' | 'EMBED' | 'P2P' | 'DIRECT' | 'UNKNOWN';

export interface RawLinkData {
  url?: string;
  link?: string;
  m3u8?: string;
  link_m3u8?: string;
  link_hls?: string;
  embed?: string;
  link_embed?: string;
  link_player?: string;
  magnet?: string;
  stream_type?: string;
  source_type?: string;
  provider?: string;
  server?: string;
  name?: string;
  [key: string]: any;
}

export class StreamLink {
  public readonly name: string;
  public readonly provider: string;
  public readonly server: string;
  private readonly data: RawLinkData;

  constructor(data: RawLinkData) {
    this.data = data;
    this.name = data.name || 'Unknown Episode';
    this.provider = (data.provider || 'UNKNOWN').toUpperCase();
    this.server = data.server || this.provider;
  }

  /**
   * Xác định loại luồng phát dựa trên dữ liệu có sẵn
   */
  get type(): StreamType {
    if (this.isP2P) return 'P2P';
    if (this.isDirect) return 'DIRECT';
    if (this.hlsUrl) return 'HLS';
    if (this.embedUrl) return 'EMBED';
    return 'UNKNOWN';
  }

  /**
   * Lấy URL cho trình phát HLS (M3U8)
   */
  get hlsUrl(): string | null {
    const url = this.data.m3u8 || this.data.link_m3u8 || this.data.link_hls;
    if (url && url.length > 5) return url;
    
    const rawUrl = this.data.url || '';
    if (rawUrl.includes('.m3u8') || rawUrl.includes('hls')) return rawUrl;
    
    return null;
  }

  /**
   * Lấy URL cho trình phát Iframe (Embed)
   */
  get embedUrl(): string | null {
    const url = this.data.embed || this.data.link_embed || this.data.link_player;
    if (url && url.length > 5) return url;
    
    const rawUrl = this.data.url || '';
    if (rawUrl.includes('embed') || this.data.source_type === 'dailymotion') return rawUrl;
    
    return null;
  }

  /**
   * Kiểm tra nếu là nguồn P2P (Torrent)
   */
  get isP2P(): boolean {
    const rawType = (this.data.stream_type || '').toUpperCase();
    const url = this.data.url || '';
    return rawType === 'P2P' || !!this.data.magnet || url.startsWith('magnet:');
  }

  /**
   * Kiểm tra nếu là nguồn tải trực tiếp (Fshare/GDrive)
   */
  get isDirect(): boolean {
    const rawType = (this.data.stream_type || '').toUpperCase();
    const url = (this.data.url || '').toLowerCase();
    return rawType === 'DIRECT' || url.includes('fshare.vn') || url.includes('drive.google.com') || url.includes('google.com/file');
  }

  /**
   * Link tốt nhất có thể dùng để phát hoặc tải
   */
  get bestUrl(): string {
    return this.hlsUrl || this.embedUrl || this.data.url || this.data.link || this.data.magnet || '';
  }
}
