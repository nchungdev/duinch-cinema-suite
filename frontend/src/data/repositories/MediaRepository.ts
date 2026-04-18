import { api } from '../../api/config';
import { MediaMapper } from '../mappers/MediaMapper';
import type { Movie, TVShow } from '../../domain/models/Media';

/**
 * Repository: MediaRepository
 * Coordinates data fetching and utilizes mappers to return Domain Models.
 */
export class MediaRepository {
  /**
   * Fetches detailed media information and returns a Domain Model.
   */
  static async getDetails(mediaType: string, tmdbId: string | number): Promise<Movie | TVShow> {
    const endpoint = mediaType === 'tv' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
    const { data: response } = await api.get(endpoint);
    
    // Delegate mapping to the dedicated Mapper
    return MediaMapper.toDomain(response, mediaType, tmdbId);
  }

  /**
   * Discovers streaming/download sources for a specific media item.
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
   * Fetches trending items for the home grid.
   */
  static async getTrending(mediaType: string = 'movie', page: number = 1) {
    const { data } = await api.get(`/trending?media_type=${mediaType}&page=${page}`);
    return data.results || [];
  }
}
