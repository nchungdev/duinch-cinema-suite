import { api } from '../api/config';
import { Movie, TVShow } from '../domain/models/Media';
import type { Genre, Season } from '../domain/models/Media';

/**
 * Repository: MediaRepository
 * Đóng gói toàn bộ logic gọi API và chuyển đổi dữ liệu sang Domain Models.
 */
export class MediaRepository {
  /**
   * Lấy thông tin chi tiết phim (Movie hoặc TV Show)
   */
  static async getDetails(mediaType: string, tmdbId: string | number): Promise<Movie | TVShow> {
    const endpoint = mediaType === 'tv' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
    const { data: response } = await api.get(endpoint);
    
    // API returns { data: { metadata: {...}, local: {...} }, error_code: 0 }
    const raw = response?.data?.metadata || response?.metadata || response;

    // Common metadata mapping
    const id = String(raw.id || raw.tmdb_id || tmdbId);
    const title = raw.title || raw.name || 'Untitled';
    const originTitle = raw.origin_name || raw.original_title || raw.original_name || title;
    const year = parseInt(raw.year || raw.release_date || raw.first_air_date || '0');
    const poster = raw.poster_url || raw.poster || raw.poster_path;
    const backdrop = raw.thumb_url || raw.backdrop_path || poster;
    const overview = raw.content || raw.overview || '';
    const genres: Genre[] = (raw.category || raw.genres || []).map((g: any) => ({
      id: g.id,
      name: g.name
    }));
    const quality = raw.quality || 'HD';

    if (mediaType === 'tv') {
      const seasons: Season[] = (raw.tmdb_seasons || raw.seasons || []).map((s: any) => ({
        season_number: s.season_number,
        name: s.name || `Season ${s.season_number}`,
        episode_count: s.episode_count || 0
      }));
      
      return new TVShow(
        id, title, originTitle, year, poster, backdrop, 
        overview, genres, seasons, raw.number_of_episodes || 0, quality
      );
    }

    return new Movie(id, title, originTitle, year, poster, backdrop, overview, genres, quality);
  }

  /**
   * Khám phá các nguồn phát (Discovery)
   */
  static async discoverSources(params: {
    tmdb_id: number;
    media_type: string;
    title: string;
    source_type: string;
    source: string;
    season?: number;
    episode?: number;
    year?: string | number;
    localize_title?: string;
  }) {
    const query = new URLSearchParams(params as any).toString();
    const { data } = await api.get(`/media/discovery?${query}`);
    return data.results || [];
  }

  /**
   * Lấy danh sách phim đang thịnh hành
   */
  static async getTrending(mediaType: string = 'movie', page: number = 1) {
    const { data } = await api.get(`/trending?media_type=${mediaType}&page=${page}`);
    return data.results || [];
  }
}
