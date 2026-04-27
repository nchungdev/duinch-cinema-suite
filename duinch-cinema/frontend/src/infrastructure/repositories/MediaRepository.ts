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
   * Khám phá các nguồn phát (Discovery - Legacy/Single API)
   */
  static async discoverSources(params: {
    tmdb_id: number;
    media_type: string;
    title: string;
    source_type: string;
    source: string;
    force?: boolean;
    season?: number;
    episode?: number;
    year?: string | number;
    localize_title?: string;
  }) {
    const query = new URLSearchParams(params as any).toString();
    const { data: response } = await api.get(`/media/fetch?${query}`);
    return response?.data?.results || response?.results || [];
  }

  /**
   * Khám phá qua Streaming (SSE) - API Mới
   * Nhận kết quả liên tục từng phần.
   */
  static async discoverSourcesStream(
    params: {
      tmdb_id: number;
      media_type: string;
      title: string;
      force?: boolean;
      season?: number;
      episode?: number;
      year?: string | number;
      localize_title?: string;
    },
    callbacks: {
      onInit?: (total: number, sources: any[]) => void;
      onResult?: (source_type: string, source: string, results: any[], error?: string | null) => void;
      onDone?: () => void;
      onError?: (err: any) => void;
    },
    abortSignal?: AbortSignal
  ) {
    try {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });

      const baseURL = api.defaults.baseURL || '';
      const url = `${baseURL.replace(/\/$/, '')}/media/stream?${searchParams.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' },
        signal: abortSignal
      });

      if (!response.body) throw new Error('ReadableStream not supported by browser.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const chunk = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');

          if (chunk.startsWith('data: ')) {
            const dataStr = chunk.slice(6);
            if (!dataStr) continue;

            try {
              const payload = JSON.parse(dataStr);
              if (payload.type === 'init') {
                callbacks.onInit?.(payload.total_sources, payload.sources);
              } else if (payload.type === 'result') {
                const data = payload.data || {};
                callbacks.onResult?.(data.source_type, data.source, data.results || [], data.error);
              } else if (payload.type === 'done') {
                callbacks.onDone?.();
                return;
              }
            } catch (e) {
              console.error('[SSE Parse Error]', e, chunk);
            }
          }
        }
      }
      callbacks.onDone?.();
    } catch (err: any) {
      if (err.name === 'AbortError') {
      } else {
        console.error('[SSE] Network/Stream Error:', err);
        callbacks.onError?.(err);
      }
    }
  }

  /**
   * Lấy danh sách phim đang thịnh hành
   */
  static async getTrending(mediaType: string = 'movie', page: number = 1) {
    const { data: response } = await api.get(`/trending?media_type=${mediaType}&page=${page}`);
    return response?.data?.results || response?.results || [];
  }
}
