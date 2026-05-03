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
  poster?: string;
  overview?: string;
  start_idx?: number;
  end_idx?: number;
}

export abstract class BaseMedia {
  public readonly id: string;
  public readonly title: string;
  public readonly originTitle: string;
  public readonly year: number;
  public readonly poster: string;
  public readonly backdrop: string;
  public readonly overview: string;
  public readonly genres: Genre[];
  public readonly quality: string;
  public readonly rating?: number;

  constructor(
    id: string,
    title: string,
    originTitle: string,
    year: number,
    poster: string,
    backdrop: string,
    overview: string,
    genres: Genre[],
    quality: string = 'HD',
    rating?: number
  ) {
    this.id = id;
    this.title = title;
    this.originTitle = originTitle;
    this.year = year;
    this.poster = poster;
    this.backdrop = backdrop;
    this.overview = overview;
    this.genres = genres;
    this.quality = quality;
    this.rating = rating;
  }

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
  public readonly seasons: Season[];
  public readonly totalEpisodes: number;

  constructor(
    id: string,
    title: string,
    originTitle: string,
    year: number,
    poster: string,
    backdrop: string,
    overview: string,
    genres: Genre[],
    seasons: Season[],
    totalEpisodes: number,
    quality: string = 'HD'
  ) {
    super(id, title, originTitle, year, poster, backdrop, overview, genres, quality);
    this.seasons = seasons;
    this.totalEpisodes = totalEpisodes;
  }

  get type(): 'tv' { return 'tv'; }

  /**
   * Tính toán thông tin mùa dựa trên index tập phim toàn cục
   */
  public getSeasonAt(globalEpisodeIdx: number): Season | null {
    let current = 0;
    for (const s of this.seasons) {
      const episodeCount = Number(s.episode_count);
      if (globalEpisodeIdx >= current && globalEpisodeIdx < current + episodeCount) {
        return s;
      }
      current += episodeCount;
    }
    return null;
  }
}
