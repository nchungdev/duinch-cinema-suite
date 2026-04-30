import { Movie, TVShow } from '../../domain/models/Media';
import type { Genre, Season } from '../../domain/models/Media';

/**
 * Data Mapper: MediaMapper
 * Responsible for translating raw API JSON data into Domain Entities.
 */
export class MediaMapper {
  /**
   * Maps raw API detail response to a Movie or TVShow instance.
   */
  static toDomain(response: any, mediaType: string, tmdbId: string | number): Movie | TVShow {
    // API returns { data: { metadata: {...}, local: {...} }, error_code: 0 }
    const raw = response?.data?.metadata || response?.metadata || response;

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
        episode_count: s.episode_count || 0,
        poster: s.poster_path || s.poster || s.poster_url,
        overview: s.overview || s.content
      }));
      
      return new TVShow(
        id, title, originTitle, year, poster, backdrop, 
        overview, genres, seasons, raw.number_of_episodes || 0, quality
      );
    }

    return new Movie(id, title, originTitle, year, poster, backdrop, overview, genres, quality);
  }

  /**
   * Maps discovery items to unified media objects (if needed in the future).
   */
  static toDiscoveryItem(item: any) {
    return {
      title: item.title,
      origin_name: item.origin_name,
      slug: item.slug,
      poster: item.poster,
      year: item.year,
      media_type: item.media_type
    };
  }
}
