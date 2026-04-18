/**
 * Domain Entities: Media Models
 * Định nghĩa cấu trúc dữ liệu chuẩn cho toàn bộ ứng dụng.
 */

export interface Genre {
  id?: string | number;
  name: string;
}

export interface Season {
  season_number: number;
  name: string;
  episode_count: number;
  start_idx?: number;
  end_idx?: number;
}

export abstract class BaseMedia {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly originTitle: string,
    public readonly year: number,
    public readonly poster: string,
    public readonly backdrop: string,
    public readonly overview: string,
    public readonly genres: Genre[],
    public readonly quality: string = 'HD',
    public readonly rating?: number
  ) {}

  abstract get type(): 'movie' | 'tv';

  /**
   * Sinh key duy nhất để lưu progress
   */
  public getProgressKey(episodeIdx?: number): string {
    if (this.type === 'movie') return this.id;
    return `${this.id}_ep${episodeIdx ?? 0}`;
  }
}

export class Movie extends BaseMedia {
  get type(): 'movie' { return 'movie'; }
}

export class TVShow extends BaseMedia {
  constructor(
    id: string,
    title: string,
    originTitle: string,
    year: number,
    poster: string,
    backdrop: string,
    overview: string,
    genres: Genre[],
    public readonly seasons: Season[],
    public readonly totalEpisodes: number,
    quality: string = 'HD'
  ) {
    super(id, title, originTitle, year, poster, backdrop, overview, genres, quality);
  }

  get type(): 'tv' { return 'tv'; }

  /**
   * Tính toán thông tin mùa dựa trên index tập phim toàn cục
   */
  public getSeasonAt(globalEpisodeIdx: number): Season | null {
    let current = 0;
    for (const s of this.seasons) {
      if (globalEpisodeIdx >= current && globalEpisodeIdx < current + s.episode_count) {
        return s;
      }
      current += s.episode_count;
    }
    return null;
  }
}
